import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MistakeItem,
  QuestionType,
  QuizReport,
  QuizSession,
} from '../quiz-types'
import type { PageId } from '../types'
import { apiDelete, apiGet, apiMutation } from '../lib/api'
import {
  mistakeListSchema,
  quizReportSchema,
  quizReportDeleteSchema,
  quizResetSchema,
  quizSessionSchema,
  unknownObjectSchema,
} from '../lib/schemas'

const labels: Record<QuestionType, string> = {
  context_translation: '英译中语境选择',
  spelling: '中文提示拼写',
  cloze: '完形填空',
  collocation_choice: '搭配选择',
  phrase_meaning: '短语释义',
  mistake_retest: '错题复测',
}

const selectableTypes = Object.keys(labels).filter(
  (type) => type !== 'mistake_retest',
) as QuestionType[]

function formatDuration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function errorReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    spelling_error: '拼写或词形不符合提示',
    collocation_confusion: '固定搭配辨析错误',
    meaning_confusion: '语境词义辨析错误',
    incomplete_answer: '未满足句意或句法要求',
    word_form_error: '词形不符合句中结构',
    preposition_error: '搭配或介词关系错误',
    no_answer: '未作答',
  }
  return labels[reason] ?? reason
}

function DegradedNotice({ reason }: { reason?: string }) {
  if (!reason) return null
  const copy: Record<string, string> = {
    INSUFFICIENT_MISTAKES_FILLED_FROM_BANK:
      '当前错题数量不足，已用同难度题目补足。',
    INSUFFICIENT_QUESTION_BANK: '所选题型的题库不足，实际题量少于请求值。',
    RECENT_FINGERPRINT_SPACE_EXHAUSTED:
      '近期可用组合较少，本次已调整题目顺序和题型。',
  }
  return (
    <p className="info-callout" role="status">
      <strong>本次题目有所调整：</strong>
      {copy[reason] ?? reason}
    </p>
  )
}

export function QuizReportPanel({
  onDeleted,
  onNavigate,
  onReset,
  report,
}: {
  onDeleted: () => void
  onNavigate: (page: PageId) => void
  onReset?: () => void
  report: QuizReport
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')

  const deleteReport = async () => {
    setDeleting(true)
    setDeleteMessage('正在删除报告…')
    try {
      await apiDelete(
        `/api/quiz/sessions/${encodeURIComponent(report.sessionId)}/report`,
        quizReportDeleteSchema,
        'quiz-report-delete',
      )
      onDeleted()
    } catch (error) {
      setDeleteMessage(
        error instanceof Error ? error.message : '报告删除失败，请重试。',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">本次练习结果</p>
        <h1>
          {report.correctCount} / {report.questionCount} 正确
        </h1>
      </header>
      <div className="button-row report-actions">
        {onReset && (
          <button
            className="button button--secondary"
            onClick={onReset}
            type="button"
          >
            重置测试
          </button>
        )}
        {confirmingDelete ? (
          <div aria-label="确认删除报告" className="button-row" role="group">
            <button
              className="button button--danger"
              disabled={deleting}
              onClick={() => void deleteReport()}
              type="button"
            >
              {deleting ? '正在删除…' : '确认删除报告'}
            </button>
            <button
              className="button button--secondary"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            className="button button--secondary"
            onClick={() => setConfirmingDelete(true)}
            type="button"
          >
            删除这份报告
          </button>
        )}
      </div>
      <p aria-live="polite" className="field-note" role="status">
        {deleteMessage}
      </p>
      <DegradedNotice reason={report.degradedReason} />
      <section aria-label="测试结果摘要" className="report-summary">
        <div>
          <span>总分</span>
          <strong>
            {report.score} / {report.maxScore}
          </strong>
        </div>
        <div>
          <span>正确率</span>
          <strong>{Math.round(report.accuracy * 100)}%</strong>
        </div>
        <div>
          <span>总用时</span>
          <strong>{formatDuration(report.totalDurationMs)}</strong>
        </div>
      </section>
      <section className="content-section" aria-labelledby="dimension-title">
        <h2 id="dimension-title">能力维度</h2>
        <div className="dimension-grid">
          {report.byType.map((item) => (
            <div className="metric-card" key={`type-${item.key}`}>
              <span>{labels[item.key]}</span>
              <strong>
                {item.correct} / {item.total}
              </strong>
            </div>
          ))}
          {report.byTheme.map((item) => (
            <div className="metric-card" key={`theme-${item.key}`}>
              <span>{item.key}</span>
              <strong>
                {item.correct} / {item.total}
              </strong>
            </div>
          ))}
        </div>
        <p>
          <strong>薄弱项：</strong>
          {report.weaknesses.length
            ? report.weaknesses.join('、')
            : '暂未发现明显薄弱项'}
        </p>
        <p>
          <strong>复习建议：</strong>
          {report.nextReviewSuggestion}
        </p>
      </section>
      <section className="content-section" aria-labelledby="answers-title">
        <h2 id="answers-title">逐题结果</h2>
        <div className="result-list">
          {report.items.map((item) => (
            <article
              className={`result-row result-row--${item.isCorrect ? 'success' : 'error'}`}
              key={item.questionId}
            >
              <span
                className={`status-tag status-tag--${item.isCorrect ? 'success' : 'error'}`}
              >
                <span aria-hidden="true">{item.isCorrect ? '✓' : '×'}</span>
                {item.isCorrect ? '正确' : '错误'}
              </span>
              <div>
                <h3>
                  {item.ordinal + 1}. {item.prompt}
                </h3>
                <p>
                  你的答案：{item.response || '未作答'} · 标准答案：
                  {item.standardAnswer}
                </p>
                <p>{item.explanation}</p>
                {item.optionAnalyses.length > 0 && (
                  <div className="option-analysis">
                    <strong>每个选项的释义与判断：</strong>
                    <ol>
                      {item.optionAnalyses.map((option, optionIndex) => (
                        <li
                          className={
                            option.isCorrect
                              ? 'option-analysis--correct'
                              : undefined
                          }
                          key={option.id}
                        >
                          <p>
                            <span className="option-analysis__label">
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            <strong lang="en">{option.originalText}</strong>
                            <span aria-hidden="true">：</span>
                            <span>{option.meaningZh}</span>
                          </p>
                          <p>
                            {option.reason}
                            {option.isCorrect ? '（正确选项）' : ''}
                            {option.isSelected ? '（你的选择）' : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {!item.isCorrect && (
                  <div className="answer-analysis">
                    <p>
                      <strong>为什么你的答案不合适：</strong>
                      {item.responseExplanation}
                    </p>
                  </div>
                )}
                <small>
                  用时 {formatDuration(item.durationMs)}
                  {item.errorReason
                    ? ` · 错误类型：${errorReasonLabel(item.errorReason)}`
                    : ''}
                </small>
              </div>
            </article>
          ))}
        </div>
        <div className="button-row">
          <button
            className="button button--primary"
            onClick={() => onNavigate('review')}
            type="button"
          >
            去错题巩固
          </button>
          <button
            className="button button--secondary"
            onClick={() => onNavigate('quiz')}
            type="button"
          >
            开始新测试
          </button>
        </div>
      </section>
    </div>
  )
}

export function QuizExperience({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  const [state, setState] = useState<
    'loading' | 'settings' | 'active' | 'report' | 'error'
  >('loading')
  const [session, setSession] = useState<QuizSession>()
  const [report, setReport] = useState<QuizReport>()
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuestionType[]>(selectableTypes)
  const [response, setResponse] = useState('')
  const [message, setMessage] = useState('正在检查可恢复的会话…')
  const [submitting, setSubmitting] = useState(false)
  const startedAt = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    void apiGet(
      '/api/quiz/sessions',
      quizSessionSchema.nullable(),
      controller.signal,
    )
      .then((active) => {
        if (active) {
          setSession(active)
          setMessage(
            `已恢复上次进度：${active.answeredQuestionIds.length} / ${active.questions.length}`,
          )
          setState('active')
        } else setState('settings')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setMessage(error instanceof Error ? error.message : '无法读取测试会话')
        setState('error')
      })
    return () => controller.abort()
  }, [])

  const question = useMemo(
    () =>
      session?.questions.find(
        (item) => !session.answeredQuestionIds.includes(item.id),
      ),
    [session],
  )

  useEffect(() => {
    startedAt.current = performance.now()
  }, [question?.id])

  const start = async (mode: 'mixed' | 'mistake_retest' = 'mixed') => {
    setSubmitting(true)
    setMessage('正在准备新题目…')
    try {
      const next: QuizSession = await apiMutation(
        '/api/quiz/sessions',
        quizSessionSchema,
        { count, types, mode },
        'quiz-create',
      )
      setSession(next)
      setResponse('')
      startedAt.current = performance.now()
      setState('active')
      setMessage('新题目已准备好，答案会在完成后统一公布。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建测试失败')
      setState('error')
    } finally {
      setSubmitting(false)
    }
  }

  const returnToSettings = () => {
    setSession(undefined)
    setReport(undefined)
    setResponse('')
    setCount(10)
    setTypes(selectableTypes)
    setMessage('请选择题量和题型。')
    setState('settings')
  }

  const resetActiveQuiz = async () => {
    if (!session) {
      returnToSettings()
      return
    }
    if (!window.confirm('确认重置当前测试？已作答的本次进度不会继续恢复。')) {
      return
    }
    setSubmitting(true)
    setMessage('正在重置测试…')
    try {
      await apiDelete(
        `/api/quiz/sessions/${encodeURIComponent(session.id)}`,
        quizResetSchema,
        'quiz-reset',
      )
      returnToSettings()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '重置测试失败')
    } finally {
      setSubmitting(false)
    }
  }

  const submit = async () => {
    if (!session || !question || !response.trim()) return
    setSubmitting(true)
    try {
      await apiMutation(
        `/api/quiz/sessions/${session.id}/answers`,
        unknownObjectSchema,
        {
          questionId: question.id,
          response,
          durationMs: Math.max(
            0,
            Math.round(performance.now() - startedAt.current),
          ),
        },
        'quiz-answer',
      )
      const answeredQuestionIds = [...session.answeredQuestionIds, question.id]
      if (answeredQuestionIds.length === session.questions.length) {
        const completed: QuizReport = await apiMutation(
          `/api/quiz/sessions/${session.id}/complete`,
          quizReportSchema,
          {},
          'quiz-complete',
        )
        setReport(completed)
        setState('report')
        setMessage('测试已完成，可以查看结果与复习建议。')
      } else {
        setSession({ ...session, answeredQuestionIds })
        setResponse('')
        startedAt.current = performance.now()
        setMessage(
          `答案已保存。进度 ${answeredQuestionIds.length} / ${session.questions.length}`,
        )
      }
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : '保存答案失败'}；当前输入仍保留，可重试。`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (state === 'report' && report)
    return (
      <QuizReportPanel
        onDeleted={returnToSettings}
        onNavigate={onNavigate}
        onReset={returnToSettings}
        report={report}
      />
    )
  if (state === 'loading')
    return (
      <div className="page page--narrow">
        <p aria-live="polite" role="status">
          {message}
        </p>
      </div>
    )
  if (state === 'error')
    return (
      <div className="page page--narrow">
        <h1>测试暂时不可用</h1>
        <p role="alert">{message}</p>
        <button
          className="button button--secondary"
          onClick={() => window.location.reload()}
          type="button"
        >
          重试
        </button>
        <button
          className="button button--secondary"
          onClick={returnToSettings}
          type="button"
        >
          返回测试设置
        </button>
      </div>
    )
  if (state === 'settings')
    return (
      <div className="page page--narrow">
        <header className="page-heading">
          <p className="eyebrow">测试设置</p>
          <h1>创建一组新的高阶英语测试</h1>
          <p>选择题量和题型，开始一组新的词汇与短语练习。</p>
        </header>
        <form
          className="quiz-panel"
          onSubmit={(event) => {
            event.preventDefault()
            void start()
          }}
        >
          <label htmlFor="quiz-count">
            <strong>题目数量</strong>
          </label>
          <select
            id="quiz-count"
            onChange={(event) => setCount(Number(event.target.value))}
            value={count}
          >
            <option value="6">6 题</option>
            <option value="10">10 题</option>
            <option value="15">15 题</option>
            <option value="20">20 题</option>
          </select>
          <fieldset className="quiz-type-settings">
            <legend>题型（至少选择一项）</legend>
            {selectableTypes.map((type) => (
              <label className="check-option" key={type}>
                <input
                  checked={types.includes(type)}
                  onChange={() =>
                    setTypes((current) =>
                      current.includes(type)
                        ? current.filter((item) => item !== type)
                        : [...current, type],
                    )
                  }
                  type="checkbox"
                />
                {labels[type]}
              </label>
            ))}
          </fieldset>
          <button
            className="button button--primary"
            disabled={submitting || types.length === 0}
            type="submit"
          >
            开始测试
          </button>
        </form>
      </div>
    )
  if (!session || !question) return null
  const completed = session.answeredQuestionIds.length
  return (
    <div className="page page--narrow">
      <header className="page-heading">
        <p className="eyebrow">
          {labels[question.type]} · 第 {completed + 1} /{' '}
          {session.questions.length} 题
        </p>
        <h1>{question.prompt}</h1>
        <p>
          {question.difficulty} · {question.theme}
        </p>
        <button
          className="button button--secondary quiz-reset-button"
          disabled={submitting}
          onClick={() => void resetActiveQuiz()}
          type="button"
        >
          重置测试
        </button>
      </header>
      <DegradedNotice reason={session.degradedReason} />
      <section aria-labelledby="quiz-question" className="quiz-panel">
        <div className="quiz-progress">
          <label htmlFor="quiz-progress">
            完成进度：{completed} / {session.questions.length}
          </label>
          <progress
            id="quiz-progress"
            max={session.questions.length}
            value={completed}
          >
            {completed} / {session.questions.length}
          </progress>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <fieldset>
            <legend id="quiz-question">
              <span className="quiz-context">{question.context}</span>
            </legend>
            {question.inputMode === 'choice' ? (
              <div className="answer-list">
                {question.options?.map((option, index) => (
                  <label className="answer-option" key={option.id}>
                    <input
                      checked={response === option.id}
                      name="quiz-answer"
                      onChange={() => setResponse(option.id)}
                      type="radio"
                      value={option.id}
                    />
                    <span aria-hidden="true">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <label htmlFor="quiz-text-answer">你的答案</label>
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  autoFocus
                  id="quiz-text-answer"
                  onChange={(event) => setResponse(event.target.value)}
                  spellCheck="false"
                  type="text"
                  value={response}
                />
              </>
            )}
          </fieldset>
          <p aria-live="polite" className="answer-status" role="status">
            {message}
          </p>
          <button
            className="button button--primary"
            disabled={submitting || !response.trim()}
            type="submit"
          >
            {submitting
              ? '正在保存…'
              : completed + 1 === session.questions.length
                ? '提交并查看报告'
                : '保存并继续'}
          </button>
        </form>
      </section>
    </div>
  )
}

export function LatestReportPage({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  const [report, setReport] = useState<QuizReport | null>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void apiGet(
      '/api/quiz/reports/latest',
      quizReportSchema.nullable(),
      controller.signal,
    )
      .then(setReport)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '读取报告失败'),
      )
    return () => controller.abort()
  }, [])
  if (error)
    return (
      <div className="page">
        <h1>报告暂时不可用</h1>
        <p role="alert">{error}</p>
      </div>
    )
  if (report === undefined)
    return (
      <div className="page">
        <p aria-live="polite">正在读取最近报告…</p>
      </div>
    )
  if (report === null)
    return (
      <div className="page">
        <h1>还没有测试报告</h1>
        <p>完成第一组测试后，这里会展示完整结果。</p>
        <button
          className="button button--primary"
          onClick={() => onNavigate('quiz')}
          type="button"
        >
          开始测试
        </button>
      </div>
    )
  return (
    <QuizReportPanel
      onDeleted={() => setReport(null)}
      onNavigate={onNavigate}
      report={report}
    />
  )
}

export function MistakeReviewPage({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  const [items, setItems] = useState<MistakeItem[]>()
  const [message, setMessage] = useState('正在读取巩固队列…')
  const [starting, setStarting] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [deletingId, setDeletingId] = useState<string>()
  useEffect(() => {
    const controller = new AbortController()
    void apiGet('/api/mistakes', mistakeListSchema, controller.signal)
      .then((data) => {
        setItems(data)
        setMessage('')
      })
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : '读取错题失败'),
      )
    return () => controller.abort()
  }, [])
  const startReview = async () => {
    setStarting(true)
    try {
      await apiMutation(
        '/api/quiz/sessions',
        quizSessionSchema,
        { count: 6, mode: 'mistake_retest' },
        'mistake-retest',
      )
      onNavigate('quiz')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '创建复测失败')
    } finally {
      setStarting(false)
    }
  }
  const dismissMastered = async (item: MistakeItem) => {
    setDeletingId(item.id)
    setMessage('正在移除已掌握题目…')
    try {
      await apiDelete(
        `/api/mistakes/${encodeURIComponent(item.id)}`,
        unknownObjectSchema,
        'mistake-dismiss',
      )
      setItems((current) => current?.filter((entry) => entry.id !== item.id))
      setPendingDeleteId(undefined)
      setMessage('已从巩固页移除；历史测试报告仍会保留。')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '移除失败，请重试')
    } finally {
      setDeletingId(undefined)
    }
  }
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">错题巩固</p>
        <h1>保留历史，逐步提高掌握度</h1>
        <p>
          连续正确会提升 mastery；达到阈值后标记为已掌握，历史记录仍会保留。
        </p>
      </header>
      <p aria-live="polite" role="status">
        {message}
      </p>
      <section
        aria-labelledby="review-action-title"
        className="review-action-card"
      >
        <div className="review-action-card__copy">
          <span className="review-action-card__kicker">优先操作</span>
          <div className="review-action-card__heading">
            <h2 id="review-action-title">复测当前错题</h2>
            <span className="review-action-card__count">
              {items
                ? `${items.filter((item) => item.status === 'active').length} 项待复习`
                : '正在统计'}
            </span>
          </div>
          <p>从当前薄弱项开始一轮短复测，完成后会更新掌握度。</p>
        </div>
        <button
          className="button button--primary review-start-button"
          disabled={
            starting || !items?.some((item) => item.status === 'active')
          }
          onClick={() => void startReview()}
          type="button"
        >
          {starting ? '正在创建…' : '开始错题复测 →'}
        </button>
      </section>
      <div className="review-queue">
        <ol>
          {items?.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>
              <span>
                {item.theme} · 错误 {item.errorCount} 次 · 连续正确{' '}
                {item.correctStreak} 次
              </span>
              <progress
                aria-label={`${item.label} 掌握度 ${item.mastery}%`}
                max="100"
                value={item.mastery}
              >
                {item.mastery}%
              </progress>
              <span>
                {item.status === 'mastered'
                  ? '已掌握（历史保留）'
                  : `待复习 · ${item.nextReviewDate}`}
              </span>
              {item.status === 'mastered' &&
                (pendingDeleteId === item.id ? (
                  <div
                    className="button-row"
                    role="group"
                    aria-label="确认移除"
                  >
                    <button
                      className="button button--danger"
                      disabled={deletingId === item.id}
                      onClick={() => void dismissMastered(item)}
                      type="button"
                    >
                      {deletingId === item.id ? '正在移除…' : '确认移除'}
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={deletingId === item.id}
                      onClick={() => setPendingDeleteId(undefined)}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    className="button button--secondary"
                    onClick={() => setPendingDeleteId(item.id)}
                    type="button"
                  >
                    不再提醒并移除
                  </button>
                ))}
            </li>
          ))}
        </ol>
      </div>
      {items && items.length === 0 && (
        <p className="info-callout">
          目前没有错题。完成测试后，错误项目会自动进入这里。
        </p>
      )}
    </div>
  )
}
