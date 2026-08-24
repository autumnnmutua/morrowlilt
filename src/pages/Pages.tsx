import { useEffect, useId, useState } from 'react'
import { apiDelete, apiGet, apiMutation } from '../lib/api'
import {
  accountStatusSchema,
  emailSettingsSchema,
  settingsSchema,
} from '../lib/schemas'
import type {
  DailyContent,
  PageId,
  ThemeChoice,
  TodayAction,
  TodayViewState,
  VocabularyItem,
} from '../types'

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}

function StatusTag({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error'
}) {
  const symbols = {
    neutral: '—',
    info: 'i',
    success: '✓',
    warning: '!',
    error: '×',
  }

  return (
    <span className={`status-tag status-tag--${tone}`}>
      <span aria-hidden="true">{symbols[tone]}</span>
      {children}
    </span>
  )
}

function LearningGroup({
  count,
  date,
  defaultOpen = false,
  items,
  label,
}: {
  count: number
  date: string
  defaultOpen?: boolean
  items: Array<{ term: string; detail: string; kind: string }>
  label: string
}) {
  return (
    <details className="learning-group" open={defaultOpen}>
      <summary>
        <span>
          <strong>{date}</strong>
          <small>{label}</small>
        </span>
        <span className="summary-meta">{count} 项 · 展开</span>
      </summary>
      <div className="learning-items">
        {items.map((item) => (
          <article className="learning-item" key={`${date}-${item.term}`}>
            <span className="item-kind">{item.kind}</span>
            <div>
              <h3>{item.term}</h3>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </details>
  )
}

function PronunciationButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'playing' | 'unavailable'>(
    'idle',
  )
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'

  if (!supported) {
    return <span className="audio-note">当前浏览器未提供系统发音。</span>
  }

  const play = () => {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-GB'
      utterance.rate = 0.88
      utterance.onstart = () => setStatus('playing')
      utterance.onend = () => setStatus('idle')
      utterance.onerror = () => setStatus('unavailable')
      window.speechSynthesis.speak(utterance)
    } catch {
      setStatus('unavailable')
    }
  }

  return (
    <span className="pronunciation-control">
      <button
        aria-label="播放英文例句发音"
        className="text-button"
        disabled={status === 'playing'}
        onClick={play}
        type="button"
      >
        {status === 'playing' ? '正在播放…' : '播放例句发音'}
      </button>
      <span aria-live="polite" className="audio-note">
        {status === 'unavailable' ? '系统音频暂不可用，可继续阅读内容。' : ''}
      </span>
    </span>
  )
}

function ExpressionPreview({
  expression,
}: {
  expression?: NonNullable<
    DailyContent['payload']['practicalExpressions']
  >[number]
}) {
  if (!expression) return null
  return (
    <article className="topic-preview">
      <div className="section-kicker">
        <span>今日地道表达</span>
        <StatusTag tone="info">{expression.partOfSpeech}</StatusTag>
      </div>
      <h2 lang="en">{expression.expression}</h2>
      <p>{expression.chineseMeanings.join(' / ')}</p>
      <p>{expression.coreMeaning}</p>
    </article>
  )
}

export function TodayPage({
  action,
  mutationMessage,
  onCheckin,
  onNavigate,
  onRetry,
  onUndo,
  state,
}: {
  action?: TodayAction
  mutationMessage?: string
  onCheckin: (action: 'learned' | 'not_learned') => void
  onNavigate: (page: PageId) => void
  onRetry: () => void
  onUndo: () => void
  state: TodayViewState
}) {
  const [confirmAction, setConfirmAction] = useState<
    'learned' | 'not_learned' | 'undo'
  >()
  const [visibleOverdueDays, setVisibleOverdueDays] = useState(4)

  if (state.status === 'loading') {
    return (
      <div className="page page--today today-load-state" aria-busy="true">
        <p className="eyebrow">每日学习</p>
        <h1>正在准备今日学习包…</h1>
        <p role="status">正在读取本地进度并确认今日内容。</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="page page--today today-load-state">
        <p className="eyebrow">每日学习</p>
        <h1>今日学习包暂时无法显示</h1>
        <p role="alert">{state.message}</p>
        <button
          className="button button--primary"
          onClick={onRetry}
          type="button"
        >
          重试
        </button>
      </div>
    )
  }

  const { data } = state
  const learningState = data.learningState
  const localDate = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(`${data.today}T00:00:00.000Z`))
  const kindLabels: Record<VocabularyItem['kind'], string> = {
    word: '单词',
    phrase: '短语',
    expression: '表达',
  }
  const toItems = (content: DailyContent) => [
    ...content.payload.vocabulary.map((item) => ({
      kind: kindLabels[item.kind],
      term: item.term,
      detail: `${item.partOfSpeech ?? '词汇'} · ${item.definitionZh ?? item.definition}`,
    })),
    ...(content.payload.practicalExpressions ?? []).map((item) => ({
      kind: '场景表达',
      term: item.expression,
      detail: item.chineseMeanings.join(' / '),
    })),
    {
      kind: '句子',
      term: content.payload.sentence.english,
      detail: content.payload.sentence.chinese,
    },
  ]
  const todayItemsFromApi = toItems(data.todayContent)
  const sentence = data.todayContent.payload.sentence
  const practicalExpressions =
    data.todayContent.payload.practicalExpressions ?? []
  const themeLabels: Record<DailyContent['payload']['theme'], string> = {
    learning: '学习',
    campus: '校园',
    technology: '科技',
    environment: '环境',
    work: '工作',
    health: '健康',
    city: '城市',
    culture: '文化',
  }
  const overdueDays = data.days.filter((day) => day.contentDate < data.today)
  const formatShortDate = (date: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00.000Z`))
  const submitting = action !== undefined
  const confirmCopy = {
    learned: {
      title: '确认结清整个待学包？',
      detail: `将结清截至 ${formatShortDate(data.today)} 的全部 ${data.pendingDayCount} 个待学日。`,
      button: '确认已学习',
    },
    not_learned: {
      title: '确认今天保持未学习？',
      detail: '结清日期不会推进，未结清内容会在下一业务日继续保留。',
      button: '确认未学习',
    },
    undo: {
      title: '撤销今天的已学习状态？',
      detail: '仅撤销同一业务日的本次结清，原待学内容会恢复。',
      button: '确认撤销',
    },
  }
  const confirmSelection = () => {
    if (confirmAction === 'undo') onUndo()
    else if (confirmAction) onCheckin(confirmAction)
    setConfirmAction(undefined)
  }

  const stateMessage =
    learningState === 'settled'
      ? '已结清截至今天的整个待学包；同一业务日内可以撤销。'
      : '当前为未学习状态。今天不完成时，全部内容明天仍会保留。'

  return (
    <div className="page page--today">
      {confirmAction ? (
        <div className="confirm-backdrop" role="presentation">
          <section
            aria-describedby="checkin-confirm-detail"
            aria-labelledby="checkin-confirm-title"
            aria-modal="true"
            className="confirm-dialog"
            role="alertdialog"
          >
            <h2 id="checkin-confirm-title">
              {confirmCopy[confirmAction].title}
            </h2>
            <p id="checkin-confirm-detail">
              {confirmCopy[confirmAction].detail}
            </p>
            <div className="button-row">
              <button
                autoFocus
                className="button button--primary"
                onClick={confirmSelection}
                type="button"
              >
                {confirmCopy[confirmAction].button}
              </button>
              <button
                className="button button--secondary"
                onClick={() => setConfirmAction(undefined)}
                type="button"
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <section
        aria-labelledby="mobile-today-title"
        className="mobile-today-overview"
      >
        <p className="eyebrow">本地日期 · {localDate}</p>
        <h1 id="mobile-today-title">今天，只做最重要的一包。</h1>
        <div className="mobile-today-facts">
          <div>
            <strong>{data.pendingDayCount} 天</strong>
            <span>待学内容</span>
          </div>
          <div>
            <strong>{todayItemsFromApi.length} 项</strong>
            <span>今日学习包</span>
          </div>
        </div>
        <article className="mobile-topic-summary">
          <p className="section-kicker">今日地道表达 · 3 条</p>
          <h2 lang="en">
            {practicalExpressions[0]?.expression ?? sentence.english}
          </h2>
          <button
            className="text-button"
            onClick={() => onNavigate('learning')}
            type="button"
          >
            查看完整场景拆解
          </button>
        </article>
        <div className="mobile-state-actions" aria-label="今日学习状态">
          <button
            aria-pressed={learningState === 'settled'}
            className="button button--primary"
            disabled={submitting || learningState === 'settled'}
            onClick={() => setConfirmAction('learned')}
            type="button"
          >
            整个待学包已学习
          </button>
          <button
            aria-pressed={learningState === 'unsettled'}
            className="button button--secondary"
            disabled={submitting}
            onClick={() =>
              setConfirmAction(
                learningState === 'settled' ? 'undo' : 'not_learned',
              )
            }
            type="button"
          >
            {learningState === 'settled' ? '撤销已学习' : '今天保持未学习'}
          </button>
        </div>
        <p aria-live="polite" className="mobile-state-note" role="status">
          {learningState === 'settled'
            ? '截至今天的整个待学包已结清。'
            : action
              ? '正在保存学习状态…'
              : '未学习；全部内容明天仍会保留。'}
        </p>
        {mutationMessage ? (
          <p aria-live="assertive" className="field-note" role="status">
            {mutationMessage}
          </p>
        ) : null}
      </section>

      <section className="today-intro" aria-labelledby="today-title">
        <div>
          <p className="eyebrow">本地日期 · {localDate}</p>
          <h1 id="today-title">上午好，今天只做最重要的一包。</h1>
          <p>
            你有 {data.pendingDayCount}
            个业务日尚未结清。旧内容按日期升序保留，不会因为进入新一天而消失。
          </p>
        </div>
        <div
          className="day-count"
          aria-label={`待学 ${data.pendingDayCount} 天`}
        >
          <strong>{data.pendingDayCount}</strong>
          <span>待学天数</span>
        </div>
      </section>

      <div className="today-grid">
        <section className="bundle-panel" aria-labelledby="bundle-title">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">今日学习包</p>
              <h2 id="bundle-title">
                {todayItemsFromApi.length} 项 · 今日内容
              </h2>
            </div>
            <StatusTag
              tone={learningState === 'settled' ? 'success' : 'warning'}
            >
              {learningState === 'settled' ? '今日已结清' : '尚未学习'}
            </StatusTag>
          </div>

          <div className="bundle-list">
            {todayItemsFromApi.map((item) => (
              <article key={item.term}>
                <span>{item.kind}</span>
                <div>
                  <h3>{item.term}</h3>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <section
            aria-labelledby="daily-vocabulary-title"
            className="daily-vocabulary"
          >
            <h3 id="daily-vocabulary-title">今日核心词汇</h3>
            <div className="vocabulary-detail-grid">
              {data.todayContent.payload.vocabulary.map((item) => (
                <article key={item.term}>
                  <div className="section-heading-row">
                    <h4 lang="en">{item.term}</h4>
                    <StatusTag tone="info">
                      {item.partOfSpeech ?? kindLabels[item.kind]}
                    </StatusTag>
                  </div>
                  <p>
                    <strong>中文释义：</strong>
                    {item.definitionZh ?? item.definition}
                  </p>
                  <p lang="en">
                    <strong>英文解释：</strong>
                    {item.definition}
                  </p>
                  <blockquote lang="en">{item.example}</blockquote>
                  {item.exampleZh ? <p>{item.exampleZh}</p> : null}
                  {item.usageNote ? (
                    <p>
                      <strong>用法提醒：</strong>
                      {item.usageNote}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {practicalExpressions.length ? (
            <section
              aria-labelledby="practical-expression-title"
              className="practical-expression-section"
            >
              <p className="section-kicker">朋友聊天 · 线下互动 · 游戏破冰</p>
              <h3 id="practical-expression-title">今天的 3 条地道表达</h3>
              <div className="practical-expression-list">
                {practicalExpressions.map((item, index) => (
                  <article
                    className="practical-expression-card"
                    key={item.expression}
                  >
                    <div className="section-heading-row">
                      <h4 lang="en">
                        {index + 1}. {item.expression}
                      </h4>
                      <StatusTag tone="info">{item.partOfSpeech}</StatusTag>
                    </div>
                    <p>
                      <strong>中英理解：</strong>
                      {item.chineseMeanings.join(' / ')}
                    </p>
                    <p>
                      <strong>核心画面：</strong>
                      {item.coreMeaning}
                    </p>
                    <div>
                      <h5>适用场景</h5>
                      {item.scenarios.map((scenario) => (
                        <section key={`${item.expression}-${scenario.label}`}>
                          <h6>{scenario.label}</h6>
                          <p>{scenario.description}</p>
                          <blockquote lang="en">{scenario.example}</blockquote>
                          <p>{scenario.exampleZh}</p>
                        </section>
                      ))}
                    </div>
                    <div className="language-notes">
                      <div>
                        <h5>易错点</h5>
                        <ul>
                          {item.pitfalls.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5>语气与替换</h5>
                        <ul>
                          {item.usageNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                          {item.alternatives.map((alternative) => (
                            <li key={alternative.expression}>
                              <strong lang="en">
                                {alternative.expression}
                              </strong>
                              ：{alternative.nuance}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p>
                      <strong>进阶迁移：</strong>
                      {item.ieltsUse}
                    </p>
                    <PronunciationButton text={item.expression} />
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="sentence-study" aria-labelledby="sentence-title">
            <div className="sentence-meta">
              <StatusTag tone="info">
                {data.todayContent.payload.difficulty}
              </StatusTag>
              <StatusTag>
                {themeLabels[data.todayContent.payload.theme]}
              </StatusTag>
              <StatusTag>材料一</StatusTag>
            </div>
            <h3 id="sentence-title">今日高阶例句</h3>
            <blockquote lang="en">{sentence.english}</blockquote>
            <p>{sentence.chinese}</p>
            <PronunciationButton text={sentence.english} />
            <div className="language-notes">
              <div>
                <h4>语法与语用</h4>
                <ul>
                  {[...sentence.grammarNotes, ...sentence.usageNotes].map(
                    (note) => (
                      <li key={note}>{note}</li>
                    ),
                  )}
                </ul>
              </div>
              <div>
                <h4>常用搭配</h4>
                <ul>
                  {sentence.collocations.map((item) => (
                    <li key={item.expression}>
                      <strong lang="en">{item.expression}</strong>：
                      {item.meaning}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>替换表达</h4>
                <ul>
                  {sentence.alternatives.map((item) => (
                    <li key={item.expression}>
                      <strong lang="en">{item.expression}</strong>：{item.note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="micro-exercise">
              <strong>微练习：</strong>
              <span lang="en">{sentence.microExercise}</span>
            </p>
          </section>

          <button
            className="text-button"
            onClick={() => onNavigate('learning')}
            type="button"
          >
            查看今日全部 {todayItemsFromApi.length} 项{' '}
            <span aria-hidden="true">→</span>
          </button>
        </section>

        <aside className="today-rail" aria-label="今日表达和学习状态">
          <ExpressionPreview expression={practicalExpressions[0]} />

          <section className="action-panel" aria-labelledby="action-title">
            <p className="section-kicker">学习状态</p>
            <h2 id="action-title">结清的是整个待学包</h2>
            <p>
              包含 {formatShortDate(data.progress.settledThroughDate)}{' '}
              之后至今天的全部未结清内容，不只是当前卡片。
            </p>
            <div className="action-stack">
              <button
                aria-pressed={learningState === 'settled'}
                className="button button--primary"
                disabled={submitting || learningState === 'settled'}
                onClick={() => setConfirmAction('learned')}
                type="button"
              >
                整个待学包已学习
              </button>
              <button
                aria-pressed={learningState === 'unsettled'}
                className="button button--secondary"
                disabled={submitting}
                onClick={() =>
                  setConfirmAction(
                    learningState === 'settled' ? 'undo' : 'not_learned',
                  )
                }
                type="button"
              >
                {learningState === 'settled'
                  ? '撤销，恢复未学习'
                  : '今天保持未学习'}
              </button>
            </div>
            <p aria-live="polite" className="state-message" role="status">
              <span aria-hidden="true">
                {learningState === 'settled' ? '✓' : '—'}
              </span>
              {stateMessage}
            </p>
          </section>
        </aside>
      </div>

      <section className="backlog-section" aria-labelledby="backlog-title">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">欠学内容</p>
            <h2 id="backlog-title">按日期保留，折叠不等于删除</h2>
          </div>
          <span className="section-note">
            累计 {overdueDays.length} 天 ·
            {overdueDays.reduce((sum, day) => sum + toItems(day).length, 0)} 项
          </span>
        </div>
        {overdueDays.length === 0 ? (
          <p className="empty-state">没有较早的欠学内容。</p>
        ) : (
          overdueDays.slice(0, visibleOverdueDays).map((day) => {
            const items = toItems(day)
            return (
              <LearningGroup
                count={items.length}
                date={formatShortDate(day.contentDate)}
                items={items}
                key={day.contentDate}
                label="未结清 · 内容仍保留"
              />
            )
          })
        )}
        {overdueDays.length > visibleOverdueDays ? (
          <button
            className="button button--secondary backlog-more"
            onClick={() => setVisibleOverdueDays((count) => count + 4)}
            type="button"
          >
            继续加载（尚有 {overdueDays.length - visibleOverdueDays} 天）
          </button>
        ) : null}
      </section>
    </div>
  )
}

export function LearningPage({
  onRetry,
  state,
}: {
  onRetry: () => void
  state: TodayViewState
}) {
  const [visibleDays, setVisibleDays] = useState(6)
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="page learning-skeleton">
        <p className="eyebrow">每日学习</p>
        <h1>正在读取全部待学内容…</h1>
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="page">
        <h1>待学内容暂时不可用</h1>
        <p role="alert">{state.message}</p>
        <button
          className="button button--primary"
          onClick={onRetry}
          type="button"
        >
          重试
        </button>
      </div>
    )
  }
  const { data } = state
  const kindLabels: Record<VocabularyItem['kind'], string> = {
    word: '单词',
    phrase: '短语',
    expression: '表达',
  }
  const toItems = (content: DailyContent) => [
    ...content.payload.vocabulary.map((item) => ({
      kind: kindLabels[item.kind],
      term: item.term,
      detail: `${item.partOfSpeech ?? kindLabels[item.kind]}；${item.definitionZh ?? item.definition}。${item.example}${item.exampleZh ? `（${item.exampleZh}）` : ''}`,
    })),
    ...(content.payload.practicalExpressions ?? []).map((item) => ({
      kind: '场景表达',
      term: item.expression,
      detail: `${item.chineseMeanings.join(' / ')}。${item.coreMeaning}`,
    })),
    {
      kind: '句子',
      term: content.payload.sentence.english,
      detail: content.payload.sentence.chinese,
    },
    {
      kind: '微练习',
      term: content.payload.sentence.microExercise,
      detail: '完成后可在首页统一结清整个待学包。',
    },
  ]
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))

  return (
    <div className="page">
      <PageHeading
        description="待学内容从上次结清后的日期开始，按日期保留，可折叠查看。"
        eyebrow={`${data.pendingDayCount} 天待学 · ${data.totalItemCount} 项`}
        title="每日学习"
      />
      <section aria-labelledby="learning-all" className="content-section">
        <div className="section-heading-row">
          <h2 id="learning-all">全部待学日期</h2>
          <StatusTag
            tone={data.learningState === 'settled' ? 'success' : 'warning'}
          >
            {data.learningState === 'settled' ? '截至今日已结清' : '尚未结清'}
          </StatusTag>
        </div>
        {data.days.length === 0 ? (
          <p className="empty-state">当前没有待学内容。</p>
        ) : (
          data.days.slice(0, visibleDays).map((day) => {
            const items = toItems(day)
            return (
              <LearningGroup
                count={items.length}
                date={formatDate(day.contentDate)}
                defaultOpen={day.contentDate === data.today}
                items={items}
                key={day.contentDate}
                label={
                  day.contentDate === data.today
                    ? '今日学习内容'
                    : '未结清 · 内容仍保留'
                }
              />
            )
          })
        )}
        {data.days.length > visibleDays ? (
          <button
            className="button button--secondary backlog-more"
            onClick={() => setVisibleDays((count) => count + 6)}
            type="button"
          >
            继续加载（尚有 {data.days.length - visibleDays} 天）
          </button>
        ) : null}
      </section>
    </div>
  )
}

export function QuizPage({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  const [answer, setAnswer] = useState('')
  const questionId = useId()

  return (
    <div className="page page--narrow">
      <PageHeading
        description="选择最贴近语境的释义，完成后查看逐题解析。"
        eyebrow="单词测试 · 第 3 / 10 题"
        title="选择最贴近的释义"
      />
      <section aria-labelledby={questionId} className="quiz-panel">
        <div className="quiz-progress">
          <label htmlFor="quiz-progress">完成进度：3 / 10</label>
          <progress id="quiz-progress" max="10" value="3">
            3 / 10
          </progress>
        </div>
        <fieldset>
          <legend id={questionId}>
            <span className="word-display">resilient</span>
            <span className="phonetic">/rɪˈzɪliənt/</span>
          </legend>
          <div className="answer-list">
            {[
              ['a', '能够迅速恢复、适应困难的'],
              ['b', '非常稀有而昂贵的'],
              ['c', '需要立即处理的'],
              ['d', '完全依赖他人的'],
            ].map(([value, label]) => (
              <label className="answer-option" key={value}>
                <input
                  checked={answer === value}
                  name="quiz-answer"
                  onChange={() => setAnswer(value)}
                  type="radio"
                  value={value}
                />
                <span aria-hidden="true">{value.toUpperCase()}</span>
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <p aria-live="polite" className="answer-status">
          {answer ? `已选择选项 ${answer.toUpperCase()}。` : '尚未选择答案。'}
        </p>
        <div className="button-row">
          <button className="button button--secondary" type="button">
            暂时跳过
          </button>
          <button
            className="button button--primary"
            disabled={!answer}
            onClick={() => onNavigate('report')}
            type="button"
          >
            提交并查看报告
          </button>
        </div>
      </section>
    </div>
  )
}

export function ReportPage({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  return (
    <div className="page">
      <PageHeading
        description="两个错误学习项已经进入错题巩固队列。"
        eyebrow="本次练习结果"
        title="8 / 10 正确"
      />
      <section className="report-summary" aria-label="测试结果摘要">
        <div>
          <span>正确率</span>
          <strong>80%</strong>
        </div>
        <div>
          <span>用时</span>
          <strong>04:36</strong>
        </div>
        <div>
          <span>进入巩固</span>
          <strong>2 项</strong>
        </div>
      </section>
      <section className="content-section" aria-labelledby="report-detail">
        <div className="section-heading-row">
          <h2 id="report-detail">逐题结果</h2>
          <StatusTag tone="success">题集指纹近期未重复</StatusTag>
        </div>
        <div className="result-list">
          <article className="result-row result-row--success">
            <StatusTag tone="success">正确</StatusTag>
            <div>
              <h3>resilient</h3>
              <p>能够从困难中恢复的；有韧性的。</p>
            </div>
          </article>
          <article className="result-row result-row--error">
            <StatusTag tone="error">错误</StatusTag>
            <div>
              <h3>allocate</h3>
              <p>正确答案：为特定目的分配资源。你选择了“积累”。</p>
            </div>
          </article>
          <article className="result-row result-row--error">
            <StatusTag tone="error">错误</StatusTag>
            <div>
              <h3>strike a balance</h3>
              <p>正确答案：在不同需求之间取得平衡。</p>
            </div>
          </article>
        </div>
        <div className="button-row">
          <button
            className="button button--primary"
            onClick={() => onNavigate('review')}
            type="button"
          >
            去巩固这 2 项
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

export function DictionaryPage() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  return (
    <div className="page page--reading">
      <PageHeading
        description="查看完整词性、释义、例句、同义词和反义词。"
        eyebrow="查词与例句"
        title="词典"
      />
      <form
        className="dictionary-search"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmittedQuery(query.trim())
        }}
      >
        <label htmlFor="dictionary-query">搜索英语单词</label>
        <div>
          <input
            id="dictionary-query"
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            value={query}
          />
          <button className="button button--primary" type="submit">
            搜索
          </button>
        </div>
      </form>

      {submittedQuery && (
        <section
          aria-labelledby="dictionary-word"
          className="dictionary-result"
        >
          <div className="dictionary-head">
            <div>
              <p className="section-kicker">词条</p>
              <h2 id="dictionary-word">{submittedQuery}</h2>
              <p className="phonetic">/rɪˈzɪliənt/</p>
            </div>
            <StatusTag tone="info">完整释义</StatusTag>
          </div>
          <article className="part-of-speech">
            <h3>adjective · 形容词</h3>
            <ol>
              <li>
                <p>能够承受或迅速从困难中恢复的；有韧性的。</p>
                <blockquote>
                  Small communities can be remarkably resilient after economic
                  change.
                  <span>经历经济变化后，小型社区可以表现出惊人的韧性。</span>
                </blockquote>
              </li>
              <li>
                <p>（材料或物体）有弹性的，能恢复原状的。</p>
                <blockquote>
                  The surface is resilient enough for repeated daily use.
                  <span>这种表面有足够弹性，能够承受日常反复使用。</span>
                </blockquote>
              </li>
            </ol>
          </article>
        </section>
      )}
    </div>
  )
}

export function ReviewPage() {
  const [reviewState, setReviewState] = useState<'idle' | 'correct' | 'again'>(
    'idle',
  )

  return (
    <div className="page">
      <PageHeading
        description="到期项目优先显示。答对会增加连续正确次数，达到阈值后移入已掌握，不会静默删除。"
        eyebrow="今天到期 4 项"
        title="错题巩固"
      />
      <div className="review-layout">
        <section className="review-card" aria-labelledby="review-word">
          <div className="section-heading-row">
            <StatusTag tone="warning">错误 2 次</StatusTag>
            <span className="section-note">连续答对 0 / 2</span>
          </div>
          <h2 id="review-word">allocate</h2>
          <p className="review-question">
            请说出它的核心含义，并完成下面的句子：
          </p>
          <blockquote>
            The city should ______ more funding to public transport.
          </blockquote>
          <label htmlFor="review-answer">你的答案</label>
          <input id="review-answer" type="text" />
          <div className="button-row">
            <button
              className="button button--primary"
              onClick={() => setReviewState('correct')}
              type="button"
            >
              检查答案
            </button>
            <button
              className="button button--secondary"
              onClick={() => setReviewState('again')}
              type="button"
            >
              还不熟，稍后再来
            </button>
          </div>
          <p aria-live="polite" className="answer-status" role="status">
            {reviewState === 'idle' && '尚未检查。'}
            {reviewState === 'correct' &&
              '答案已检查，本项连续答对次数将更新。'}
            {reviewState === 'again' && '本项保留在巩固队列。'}
          </p>
        </section>
        <aside className="review-queue" aria-labelledby="review-queue-title">
          <h2 id="review-queue-title">接下来</h2>
          <ol>
            <li>
              <strong>strike a balance</strong>
              <span>短语 · 今天到期</span>
            </li>
            <li>
              <strong>compelling</strong>
              <span>单词 · 今天到期</span>
            </li>
            <li>
              <strong>in the long run</strong>
              <span>短语 · 明天到期</span>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  )
}

export function SettingsPage({
  onThemeChange,
  theme,
}: {
  onThemeChange: (theme: ThemeChoice) => void
  theme: ThemeChoice
}) {
  const [learningTrack, setLearningTrack] = useState<'academic' | 'general'>(
    'academic',
  )
  const [trackStatus, setTrackStatus] = useState('正在读取学习轨道…')
  const [timeZone, setTimeZone] = useState('')
  const [email, setEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<
    'not_configured' | 'pending' | 'verified' | 'unsubscribed'
  >('not_configured')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [emailMessage, setEmailMessage] = useState('正在读取邮件设置…')
  const [deliveryMode, setDeliveryMode] = useState<
    'platform' | 'bring_your_own'
  >('platform')
  const [providerConfigured, setProviderConfigured] = useState(false)
  const [providerApiKey, setProviderApiKey] = useState('')
  const [mailFrom, setMailFrom] = useState('')
  const [sendHourLocal, setSendHourLocal] = useState(23)
  const [accountDisabled, setAccountDisabled] = useState(false)
  const [accountMessage, setAccountMessage] = useState(
    '停用账号会暂停访问和邮件，但保留历史学习数据。',
  )

  useEffect(() => {
    const controller = new AbortController()
    void apiGet('/api/settings', settingsSchema, controller.signal)
      .then((data) => {
        setLearningTrack(data.learningTrack)
        setTimeZone(data.timeZone ?? '')
        setTrackStatus('当前学习轨道已加载。')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setTrackStatus(
          error instanceof Error ? error.message : '轨道设置暂时不可用',
        )
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const verificationToken = new URL(window.location.href).searchParams.get(
      'email_verify',
    )
    const operation = verificationToken
      ? apiMutation(
          '/api/email/settings',
          emailSettingsSchema,
          { action: 'verify', token: verificationToken },
          'email-verify',
          controller.signal,
        )
      : apiGet('/api/email/settings', emailSettingsSchema, controller.signal)
    void operation
      .then((data) => {
        setEmailStatus(data.status)
        setMaskedEmail(data.maskedEmail ?? '')
        setDeliveryMode(data.deliveryMode ?? 'platform')
        setProviderConfigured(data.providerConfigured ?? false)
        setSendHourLocal(data.sendHourLocal ?? 23)
        setTimeZone(data.timeZone)
        setEmailMessage(
          verificationToken && data.status === 'verified'
            ? '邮箱已确认，每日邮件将在设定时间发送。'
            : '邮件设置已加载。',
        )
        if (verificationToken) {
          const url = new URL(window.location.href)
          url.searchParams.delete('email_verify')
          window.history.replaceState({}, '', url)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setEmailMessage(
          error instanceof Error ? error.message : '邮件设置暂时不可用',
        )
      })
    return () => controller.abort()
  }, [])

  const changeLearningTrack = async (track: 'academic' | 'general') => {
    const previous = learningTrack
    setLearningTrack(track)
    setTrackStatus('正在保存学习轨道…')
    try {
      const data = await apiMutation(
        '/api/settings',
        settingsSchema,
        { track },
        'settings-track',
      )
      setLearningTrack(data.learningTrack)
      setTimeZone(data.timeZone ?? timeZone)
      setTrackStatus('学习轨道已更新，今日话题已切换。')
    } catch (error) {
      setLearningTrack(previous)
      setTrackStatus(
        `${error instanceof Error ? error.message : '轨道保存失败'} 原设置已恢复。`,
      )
    }
  }

  const changeEmailSetting = async (
    action: 'bind' | 'test' | 'unsubscribe',
  ) => {
    setEmailMessage(
      action === 'bind'
        ? '正在发送确认邮件…'
        : action === 'test'
          ? '正在发送测试邮件…'
          : '正在取消订阅…',
    )
    try {
      const data = await apiMutation(
        '/api/email/settings',
        emailSettingsSchema,
        action === 'bind' ? { action, email } : { action },
        `email-${action}`,
      )
      setEmailStatus(data.status)
      setMaskedEmail(data.maskedEmail ?? '')
      setEmail('')
      setEmailMessage(
        action === 'bind'
          ? '确认邮件已发送，请在 30 分钟内完成确认。'
          : action === 'test'
            ? data.testOutcome === 'already_sent'
              ? '今天的测试邮件已经发送过。'
              : '测试邮件已提交，请检查收件箱。'
            : '已取消每日邮件。',
      )
    } catch (error) {
      setEmailMessage(
        error instanceof Error ? error.message : '邮件设置更新失败',
      )
    }
  }

  const configureEmailProvider = async () => {
    setEmailMessage('正在核验发送域并加密保存邮件服务设置…')
    try {
      const data = await apiMutation(
        '/api/email/settings',
        emailSettingsSchema,
        {
          action: 'configure_provider',
          apiKey: providerApiKey,
          mailFrom,
          timeZone,
          sendHourLocal,
        },
        'email-provider-config',
      )
      setProviderConfigured(data.providerConfigured ?? true)
      setSendHourLocal(data.sendHourLocal ?? sendHourLocal)
      setProviderApiKey('')
      setEmailMessage(
        '发送域验证通过，邮件 API 已加密保存，可以继续绑定接收邮箱。',
      )
    } catch (error) {
      setEmailMessage(
        error instanceof Error ? error.message : '邮件 API 保存失败',
      )
    }
  }

  const changeAccountStatus = async (action: 'disable' | 'reauthorize') => {
    if (
      action === 'disable' &&
      !window.confirm('确认停用当前账号？历史学习数据会保留，邮件将停止。')
    ) {
      return
    }
    setAccountMessage(
      action === 'disable' ? '正在停用账号…' : '正在重新授权账号…',
    )
    try {
      const data =
        action === 'disable'
          ? await apiDelete(
              '/api/account',
              accountStatusSchema,
              'account-disable',
            )
          : await apiMutation(
              '/api/account/reauthorize',
              accountStatusSchema,
              {},
              'account-reauthorize',
            )
      setAccountDisabled(data.status === 'disabled')
      setAccountMessage(
        data.status === 'disabled'
          ? '账号已停用，历史进度仍保留。可在本页重新授权。'
          : '账号已重新授权，原有学习进度已恢复。',
      )
    } catch (error) {
      setAccountMessage(
        error instanceof Error ? error.message : '账号状态更新失败',
      )
    }
  }

  return (
    <div className="page page--reading">
      <PageHeading
        description="调整学习轨道、邮件和显示方式。"
        eyebrow="学习偏好"
        title="设置"
      />
      <div className="settings-form">
        <fieldset>
          <legend>学习计划</legend>
          <label htmlFor="learning-track">学习轨道</label>
          <select
            id="learning-track"
            onChange={(event) =>
              void changeLearningTrack(
                event.target.value as 'academic' | 'general',
              )
            }
            value={learningTrack}
          >
            <option value="academic">Academic</option>
            <option value="general">General Training</option>
          </select>
          <p aria-live="polite" className="field-note" role="status">
            {trackStatus}
          </p>
          <p>
            <strong>业务时区：</strong>
            {timeZone || '正在读取…'}
          </p>
          <p className="field-note">
            业务时区同时决定每日内容日期与邮件发送时间。
          </p>
        </fieldset>

        <fieldset>
          <legend>账号与数据</legend>
          <p>学习进度、测试、错题、收藏和邮箱设置只属于当前登录账号。</p>
          <button
            className="button button--secondary"
            onClick={() =>
              void changeAccountStatus(
                accountDisabled ? 'reauthorize' : 'disable',
              )
            }
            type="button"
          >
            {accountDisabled ? '重新授权账号' : '停用当前账号'}
          </button>
          <p aria-live="polite" className="field-note" role="status">
            {accountMessage}
          </p>
        </fieldset>

        <fieldset>
          <legend>每日邮件</legend>
          <p>
            每个账号单独保存邮箱、时区和发送小时，邮件内容与该账号当天网页一致。
          </p>
          {deliveryMode === 'bring_your_own' ? (
            <div className="settings-form">
              <p className="field-note">
                请提供自己的 Resend API Key 和已验证域名下的发件地址。API
                会加密保存，保存后不会再次显示。
              </p>
              <label htmlFor="resend-api-key">Resend API Key</label>
              <input
                autoComplete="off"
                id="resend-api-key"
                maxLength={220}
                onChange={(event) => setProviderApiKey(event.target.value)}
                placeholder={
                  providerConfigured ? '已配置；输入新值可替换' : 're_…'
                }
                type="password"
                value={providerApiKey}
              />
              <label htmlFor="mail-from">发件地址</label>
              <input
                id="mail-from"
                maxLength={320}
                onChange={(event) => setMailFrom(event.target.value)}
                placeholder={[
                  'Daily English <daily',
                  'send.example.invalid>',
                ].join('@')}
                type="text"
                value={mailFrom}
              />
              <label htmlFor="mail-time-zone">邮件时区</label>
              <input
                id="mail-time-zone"
                maxLength={64}
                onChange={(event) => setTimeZone(event.target.value)}
                placeholder="Asia/Shanghai"
                type="text"
                value={timeZone}
              />
              <label htmlFor="mail-send-hour">每日发送小时</label>
              <select
                id="mail-send-hour"
                onChange={(event) =>
                  setSendHourLocal(Number(event.target.value))
                }
                value={sendHourLocal}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <button
                className="button button--secondary"
                disabled={
                  !providerApiKey.trim() || !mailFrom.trim() || !timeZone.trim()
                }
                onClick={() => void configureEmailProvider()}
                type="button"
              >
                {providerConfigured ? '更新邮件 API' : '保存邮件 API'}
              </button>
            </div>
          ) : (
            <p className="field-note">
              此账号使用站点邮件服务，每天{' '}
              {String(sendHourLocal).padStart(2, '0')}:00 发送。
            </p>
          )}
          {maskedEmail ? (
            <p>
              <strong>当前邮箱：</strong>
              {maskedEmail}
            </p>
          ) : null}
          {emailStatus !== 'verified' ? (
            <>
              <label htmlFor="delivery-email">接收邮箱</label>
              <input
                autoComplete="email"
                id="delivery-email"
                inputMode="email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入接收邮箱"
                type="email"
                value={email}
              />
              <button
                className="button button--primary"
                disabled={
                  !email.trim() ||
                  (deliveryMode === 'bring_your_own' && !providerConfigured)
                }
                onClick={() => void changeEmailSetting('bind')}
                type="button"
              >
                发送确认邮件
              </button>
            </>
          ) : (
            <div className="button-row">
              <button
                className="button button--primary"
                onClick={() => void changeEmailSetting('test')}
                type="button"
              >
                发送测试邮件
              </button>
              <button
                className="button button--secondary"
                onClick={() => void changeEmailSetting('unsubscribe')}
                type="button"
              >
                取消订阅
              </button>
            </div>
          )}
          <p aria-live="polite" className="field-note" role="status">
            {emailMessage}
          </p>
        </fieldset>

        <fieldset>
          <legend>外观与无障碍</legend>
          <div className="theme-options" role="group" aria-label="主题选择">
            {(['system', 'light', 'dark'] as const).map((option) => {
              const labels = { system: '跟随系统', light: '浅色', dark: '深色' }
              return (
                <button
                  aria-pressed={theme === option}
                  className="choice-button"
                  key={option}
                  onClick={() => onThemeChange(option)}
                  type="button"
                >
                  {labels[option]}
                </button>
              )
            })}
          </div>
          <p className="field-note">
            减少动画会跟随设备设置；核心状态变化不会依赖动画表达。
          </p>
        </fieldset>
      </div>
    </div>
  )
}
