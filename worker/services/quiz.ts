import { getBankQuestion } from '../quiz/bank'
import { createSeedHex, generateQuiz } from '../quiz/generator'
import { scoreAnswer } from '../quiz/scoring'
import type {
  AnswerAnalysis,
  BankQuestion,
  PublicQuestion,
  QuestionType,
  QuizMode,
  QuizReport,
  QuizReportItem,
  QuizSessionView,
} from '../quiz/types'

const allTypes: QuestionType[] = [
  'context_translation',
  'spelling',
  'cloze',
  'collocation_choice',
  'phrase_meaning',
]

const masteryThreshold = 80

export class QuizDomainError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'QuizDomainError'
    this.code = code
    this.status = status
  }
}

type SessionRow = {
  id: string
  mode: QuizMode
  status: 'in_progress' | 'completed'
  question_fingerprint: string
  degraded_reason: string | null
  started_at: string
  report_deleted_at: string | null
}

type QuestionRow = {
  id: string
  bank_question_id: string
  ordinal: number
  question_type: QuestionType
  public_json: string
  standard_answer_json: string
  acceptable_answers_json: string
  explanation: string
  answer_analysis_json: string
  tags_json: string
  difficulty: 'C1' | 'C2'
  theme: string
  source: string
}

type AnswerRow = {
  session_question_id: string
  response_json: string
  is_correct: number
  score: number
  error_reason: string | null
  duration_ms: number
}

type MistakeRow = {
  id: string
  bank_question_id: string
  status: 'active' | 'mastered'
  error_count: number
  correct_streak: number
  mastery: number
  next_review_date: string
  mastered_at: string | null
  dismissed_at: string | null
}

function parseArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) &&
    parsed.every((item) => typeof item === 'string')
    ? parsed
    : []
}

function parseAnswerAnalysis(value: string): AnswerAnalysis {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { reasoning?: unknown }).reasoning === 'string'
    ) {
      const record = parsed as {
        reasoning: string
        optionReasons?: unknown
        optionMeanings?: unknown
      }
      const optionReasons =
        typeof record.optionReasons === 'object' &&
        record.optionReasons !== null &&
        !Array.isArray(record.optionReasons)
          ? Object.fromEntries(
              Object.entries(record.optionReasons).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string',
              ),
            )
          : undefined
      const optionMeanings =
        typeof record.optionMeanings === 'object' &&
        record.optionMeanings !== null &&
        !Array.isArray(record.optionMeanings)
          ? Object.fromEntries(
              Object.entries(record.optionMeanings).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string',
              ),
            )
          : undefined
      return { reasoning: record.reasoning, optionReasons, optionMeanings }
    }
  } catch {
    // Older rows fall back to the stored explanation below.
  }
  return { reasoning: '结合词义、语法结构和上下文判断答案。' }
}

function publicQuestion(row: QuestionRow): PublicQuestion {
  const value = JSON.parse(row.public_json) as Omit<
    PublicQuestion,
    'id' | 'ordinal'
  >
  return { ...value, id: row.id, ordinal: row.ordinal }
}

function bankQuestion(row: QuestionRow): BankQuestion {
  const visible = publicQuestion(row)
  return {
    ...visible,
    id: row.bank_question_id,
    standardAnswer: String(JSON.parse(row.standard_answer_json)),
    acceptableAnswers: parseArray(row.acceptable_answers_json),
    explanation: row.explanation,
    answerAnalysis: parseAnswerAnalysis(row.answer_analysis_json),
    errorReason:
      row.question_type === 'spelling'
        ? 'spelling_error'
        : row.question_type === 'collocation_choice'
          ? 'collocation_confusion'
          : row.question_type === 'context_translation' ||
              row.question_type === 'phrase_meaning'
            ? 'meaning_confusion'
            : 'incomplete_answer',
  }
}

async function getQuestions(
  db: D1Database,
  sessionId: string,
): Promise<QuestionRow[]> {
  const result = await db
    .prepare(
      `SELECT id, bank_question_id, ordinal, question_type, public_json,
              standard_answer_json, acceptable_answers_json, explanation,
              answer_analysis_json,
              tags_json, difficulty, theme, source
       FROM quiz_session_questions WHERE session_id = ? ORDER BY ordinal`,
    )
    .bind(sessionId)
    .all<QuestionRow>()
  return result.results
}

async function getAnswers(
  db: D1Database,
  sessionId: string,
): Promise<AnswerRow[]> {
  const result = await db
    .prepare(
      `SELECT session_question_id, response_json, is_correct, score,
              error_reason, duration_ms
       FROM quiz_answers WHERE session_id = ? ORDER BY answered_at`,
    )
    .bind(sessionId)
    .all<AnswerRow>()
  return result.results
}

async function getSession(
  db: D1Database,
  profileId: string,
  sessionId: string,
): Promise<SessionRow | undefined> {
  return (
    (await db
      .prepare(
        `SELECT id, mode, status, question_fingerprint, degraded_reason, started_at,
                report_deleted_at
         FROM quiz_sessions WHERE id = ? AND profile_id = ? LIMIT 1`,
      )
      .bind(sessionId, profileId)
      .first<SessionRow>()) ?? undefined
  )
}

async function sessionView(
  db: D1Database,
  session: SessionRow,
): Promise<QuizSessionView> {
  const [questions, answers] = await Promise.all([
    getQuestions(db, session.id),
    getAnswers(db, session.id),
  ])
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    questionFingerprint: session.question_fingerprint,
    degradedReason: session.degraded_reason ?? undefined,
    startedAt: session.started_at,
    answeredQuestionIds: answers.map((answer) => answer.session_question_id),
    questions: questions.map(publicQuestion),
  }
}

export async function createQuizSession(input: {
  db: D1Database
  profileId: string
  idempotencyKey: string
  count: number
  types: QuestionType[]
  mode: QuizMode
  seedHex?: string
}): Promise<QuizSessionView> {
  const existing = await input.db
    .prepare(
      `SELECT id, mode, status, question_fingerprint, degraded_reason, started_at,
              report_deleted_at
       FROM quiz_sessions WHERE profile_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.profileId, input.idempotencyKey)
    .first<SessionRow>()
  if (existing) return sessionView(input.db, existing)

  const [recentResult, mistakeResult] = await Promise.all([
    input.db
      .prepare(
        `SELECT question_fingerprint FROM quiz_sessions
         WHERE profile_id = ? AND status IN ('in_progress', 'completed')
         ORDER BY started_at DESC LIMIT 20`,
      )
      .bind(input.profileId)
      .all<{ question_fingerprint: string }>(),
    input.db
      .prepare(
        `SELECT bank_question_id FROM mistake_book
         WHERE profile_id = ? AND status = 'active' AND dismissed_at IS NULL
         ORDER BY next_review_date, last_reviewed_at LIMIT 30`,
      )
      .bind(input.profileId)
      .all<{ bank_question_id: string }>(),
  ])
  const seedHex = input.seedHex ?? createSeedHex()
  const generated = await generateQuiz({
    seedHex,
    count: input.count,
    types: input.types,
    mode: input.mode,
    recentFingerprints: recentResult.results.map(
      (row) => row.question_fingerprint,
    ),
    mistakeIds: mistakeResult.results.map((row) => row.bank_question_id),
  })
  if (generated.questions.length === 0) {
    throw new QuizDomainError(
      'QUESTION_BANK_EMPTY',
      'No questions are available',
      409,
    )
  }

  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()
  const statements = [
    input.db
      .prepare(
        `INSERT INTO quiz_sessions (
          id, profile_id, mode, seed_hex, question_fingerprint, question_count,
          settings_json, degraded_reason, idempotency_key, started_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        sessionId,
        input.profileId,
        input.mode,
        generated.seedHex,
        generated.fingerprint,
        generated.questions.length,
        JSON.stringify({ count: input.count, types: input.types }),
        generated.degradedReason ?? null,
        input.idempotencyKey,
        now,
        now,
      ),
  ]
  generated.questions.forEach((question, ordinal) => {
    const publicData: Omit<PublicQuestion, 'id' | 'ordinal'> = {
      bankQuestionId: question.id,
      type: question.type,
      prompt: question.prompt,
      context: question.context,
      inputMode: question.inputMode,
      options: question.options,
      theme: question.theme,
      difficulty: question.difficulty,
      tags: question.tags,
      source: question.source,
    }
    statements.push(
      input.db
        .prepare(
          `INSERT INTO quiz_session_questions (
            id, session_id, bank_question_id, ordinal, question_type, public_json,
            standard_answer_json, acceptable_answers_json, explanation, tags_json,
            answer_analysis_json, difficulty, theme, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          sessionId,
          question.id,
          ordinal,
          question.type,
          JSON.stringify(publicData),
          JSON.stringify(question.standardAnswer),
          JSON.stringify(question.acceptableAnswers),
          question.explanation,
          JSON.stringify(question.tags),
          JSON.stringify(question.answerAnalysis),
          question.difficulty,
          question.theme,
          question.source,
          now,
        ),
    )
  })
  await input.db.batch(statements)
  if (generated.degradedReason) {
    console.warn(
      JSON.stringify({
        event: 'quiz_generation_degraded',
        code: generated.degradedReason,
        sessionId,
        requestedCount: input.count,
        deliveredCount: generated.questions.length,
      }),
    )
  }
  const created = await getSession(input.db, input.profileId, sessionId)
  if (!created) throw new Error('Quiz session could not be created')
  return sessionView(input.db, created)
}

export async function getActiveQuizSession(
  db: D1Database,
  profileId: string,
): Promise<QuizSessionView | undefined> {
  const row = await db
    .prepare(
      `SELECT id, mode, status, question_fingerprint, degraded_reason, started_at,
              report_deleted_at
       FROM quiz_sessions WHERE profile_id = ? AND status = 'in_progress'
       ORDER BY last_activity_at DESC LIMIT 1`,
    )
    .bind(profileId)
    .first<SessionRow>()
  return row ? sessionView(db, row) : undefined
}

export async function getQuizSessionView(
  db: D1Database,
  profileId: string,
  sessionId: string,
): Promise<QuizSessionView> {
  const session = await getSession(db, profileId, sessionId)
  if (!session)
    throw new QuizDomainError(
      'QUIZ_SESSION_NOT_FOUND',
      'Quiz session not found',
      404,
    )
  return sessionView(db, session)
}

export async function submitQuizAnswer(input: {
  db: D1Database
  profileId: string
  sessionId: string
  questionId: string
  response: string
  durationMs: number
  idempotencyKey: string
}): Promise<{ accepted: true; answeredCount: number; questionCount: number }> {
  const session = await getSession(input.db, input.profileId, input.sessionId)
  if (!session)
    throw new QuizDomainError(
      'QUIZ_SESSION_NOT_FOUND',
      'Quiz session not found',
      404,
    )
  if (session.status !== 'in_progress') {
    throw new QuizDomainError(
      'QUIZ_ALREADY_COMPLETED',
      'Quiz session is already completed',
      409,
    )
  }
  const question = await input.db
    .prepare(
      `SELECT id, bank_question_id, ordinal, question_type, public_json,
              standard_answer_json, acceptable_answers_json, explanation,
              answer_analysis_json,
              tags_json, difficulty, theme, source
       FROM quiz_session_questions WHERE id = ? AND session_id = ? LIMIT 1`,
    )
    .bind(input.questionId, input.sessionId)
    .first<QuestionRow>()
  if (!question)
    throw new QuizDomainError(
      'QUIZ_QUESTION_NOT_FOUND',
      'Question not found',
      404,
    )

  const existing = await input.db
    .prepare(
      `SELECT id FROM quiz_answers WHERE session_question_id = ? LIMIT 1`,
    )
    .bind(input.questionId)
    .first<{ id: string }>()
  if (!existing) {
    const result = scoreAnswer(bankQuestion(question), input.response)
    const now = new Date().toISOString()
    await input.db.batch([
      input.db
        .prepare(
          `INSERT INTO quiz_answers (
            id, session_id, session_question_id, response_json,
            normalized_response, is_correct, score, error_reason,
            duration_ms, idempotency_key, answered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_question_id) DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          input.sessionId,
          input.questionId,
          JSON.stringify(input.response),
          result.normalizedResponse,
          result.isCorrect ? 1 : 0,
          result.score,
          result.errorReason ?? null,
          input.durationMs,
          input.idempotencyKey,
          now,
        ),
      input.db
        .prepare(`UPDATE quiz_sessions SET last_activity_at = ? WHERE id = ?`)
        .bind(now, input.sessionId),
    ])
  }
  const counts = await input.db
    .prepare(
      `SELECT
         (SELECT count(*) FROM quiz_answers WHERE session_id = ?) AS answered_count,
         (SELECT question_count FROM quiz_sessions WHERE id = ?) AS question_count`,
    )
    .bind(input.sessionId, input.sessionId)
    .first<{ answered_count: number; question_count: number }>()
  if (!counts) throw new Error('Quiz answer count unavailable')
  return {
    accepted: true,
    answeredCount: counts.answered_count,
    questionCount: counts.question_count,
  }
}

function aggregate(items: QuizReportItem[], key: 'type' | 'theme') {
  const values = new Map<string, { correct: number; total: number }>()
  for (const item of items) {
    const name = item[key]
    const current = values.get(name) ?? { correct: 0, total: 0 }
    current.total += 1
    if (item.isCorrect) current.correct += 1
    values.set(name, current)
  }
  return [...values].map(([name, value]) => ({ key: name, ...value }))
}

async function buildReport(
  db: D1Database,
  session: SessionRow,
): Promise<QuizReport> {
  const [questions, answers] = await Promise.all([
    getQuestions(db, session.id),
    getAnswers(db, session.id),
  ])
  const answerMap = new Map(
    answers.map((answer) => [answer.session_question_id, answer]),
  )
  const items: QuizReportItem[] = questions.map((question) => {
    const answer = answerMap.get(question.id)
    const visible = publicQuestion(question)
    const storedAnalysis = parseAnswerAnalysis(question.answer_analysis_json)
    const canonicalAnalysis = getBankQuestion(
      question.bank_question_id,
    )?.answerAnalysis
    const analysis: AnswerAnalysis = {
      reasoning: storedAnalysis.reasoning,
      optionReasons: {
        ...canonicalAnalysis?.optionReasons,
        ...storedAnalysis.optionReasons,
      },
      optionMeanings: {
        ...canonicalAnalysis?.optionMeanings,
        ...storedAnalysis.optionMeanings,
      },
    }
    const rawResponse = answer ? String(JSON.parse(answer.response_json)) : ''
    const rawStandardAnswer = String(JSON.parse(question.standard_answer_json))
    const selectedOption = visible.options?.find(
      (option) => option.id === rawResponse,
    )
    const correctOption = visible.options?.find(
      (option) => option.id === rawStandardAnswer,
    )
    const responseExplanation = selectedOption
      ? (analysis.optionReasons?.[selectedOption.id] ?? analysis.reasoning)
      : answer?.is_correct === 1
        ? `你的答案符合可接受答案。${analysis.reasoning}`
        : `“${rawResponse || '未作答'}”未满足本题要求。${analysis.reasoning}`
    const optionAnalyses =
      visible.options?.map((option) => {
        const meaningZh =
          analysis.optionMeanings?.[option.id] ??
          (/\p{Script=Han}/u.test(option.label)
            ? option.label
            : `“${option.label}”在本题语境中的中文含义`)
        const isCorrect = option.id === rawStandardAnswer
        return {
          id: option.id,
          label: option.label,
          meaningZh,
          reason:
            analysis.optionReasons?.[option.id] ??
            (isCorrect
              ? `该选项表示“${meaningZh}”，符合本题考查点。${question.explanation}`
              : `该选项表示“${meaningZh}”，放入本句后不能准确表达题干要求；${question.explanation}`),
          isCorrect,
          isSelected: option.id === rawResponse,
        }
      }) ?? []
    const eliminationSteps = optionAnalyses
      .filter((option) => !option.isCorrect)
      .map(
        (option) => `${option.label}（${option.meaningZh}）：${option.reason}`,
      )
    return {
      questionId: question.id,
      bankQuestionId: question.bank_question_id,
      ordinal: question.ordinal,
      type: question.question_type,
      prompt: visible.prompt,
      theme: question.theme,
      response: selectedOption?.label ?? rawResponse,
      standardAnswer: correctOption?.label ?? rawStandardAnswer,
      acceptableAnswers: parseArray(question.acceptable_answers_json),
      explanation: question.explanation,
      responseExplanation,
      eliminationSteps,
      optionAnalyses,
      isCorrect: answer?.is_correct === 1,
      score: answer?.score ?? 0,
      durationMs: answer?.duration_ms ?? 0,
      errorReason: answer?.error_reason ?? (answer ? undefined : 'no_answer'),
    }
  })
  const correctCount = items.filter((item) => item.isCorrect).length
  const reasons = new Map<string, number>()
  items.forEach((item) => {
    if (!item.errorReason) return
    reasons.set(item.errorReason, (reasons.get(item.errorReason) ?? 0) + 1)
  })
  const byType = aggregate(items, 'type') as QuizReport['byType']
  const byTheme = aggregate(items, 'theme')
  const weaknesses = [...byType, ...byTheme]
    .filter((item) => item.correct / item.total < 0.7)
    .sort(
      (left, right) => left.correct / left.total - right.correct / right.total,
    )
    .slice(0, 3)
    .map((item) => item.key)
  const score = items.reduce((sum, item) => sum + item.score, 0)
  return {
    sessionId: session.id,
    questionFingerprint: session.question_fingerprint,
    degradedReason: session.degraded_reason ?? undefined,
    score,
    maxScore: items.length,
    correctCount,
    questionCount: items.length,
    accuracy: items.length === 0 ? 0 : correctCount / items.length,
    totalDurationMs: items.reduce((sum, item) => sum + item.durationMs, 0),
    byType,
    byTheme,
    errorReasons: [...reasons].map(([key, count]) => ({ key, count })),
    weaknesses,
    nextReviewSuggestion:
      weaknesses.length > 0
        ? `优先复习：${weaknesses.join('、')}；建议下一个业务日进行错题复测。`
        : '本次表现稳定；建议下一次更换题型组合并保持间隔复习。',
    items,
  }
}

async function updateMistakes(
  db: D1Database,
  profileId: string,
  sessionId: string,
  report: QuizReport,
  businessDate: string,
): Promise<void> {
  const now = new Date().toISOString()
  const bankQuestionIds = [
    ...new Set(report.items.map((item) => item.bankQuestionId)),
  ]
  const placeholders = bankQuestionIds.map(() => '?').join(', ')
  const existingRows = bankQuestionIds.length
    ? await db
        .prepare(
          `SELECT id, bank_question_id, status, error_count, correct_streak,
                  mastery, next_review_date, mastered_at, dismissed_at
           FROM mistake_book
           WHERE profile_id = ? AND bank_question_id IN (${placeholders})`,
        )
        .bind(profileId, ...bankQuestionIds)
        .all<MistakeRow>()
    : { results: [] as MistakeRow[] }
  const existingByQuestion = new Map(
    existingRows.results.map((row) => [row.bank_question_id, row]),
  )
  const statements: D1PreparedStatement[] = []
  for (const item of report.items) {
    const existing = existingByQuestion.get(item.bankQuestionId)
    if (item.isCorrect && existing?.dismissed_at) continue
    if (item.isCorrect && !existing) continue
    const mistakeId = existing?.id ?? crypto.randomUUID()
    const before = existing?.mastery ?? 35
    const streak = item.isCorrect ? (existing?.correct_streak ?? 0) + 1 : 0
    const after = item.isCorrect
      ? Math.min(100, before + 25)
      : Math.max(0, before - 15)
    const mastered = item.isCorrect && streak >= 2 && after >= masteryThreshold
    statements.push(
      db
        .prepare(
          `INSERT INTO mistake_book (
             id, profile_id, bank_question_id, status, error_count,
             correct_streak, mastery, first_wrong_at, last_reviewed_at,
             next_review_date, mastered_at, dismissed_at
           ) VALUES (?, ?, ?, 'active', 1, 0, ?, ?, ?, date(?, '+1 day'), NULL, NULL)
           ON CONFLICT(profile_id, bank_question_id) DO UPDATE SET
             status = ?,
             error_count = mistake_book.error_count + ?,
             correct_streak = ?, mastery = ?, last_reviewed_at = ?,
             next_review_date = date(?, ?), mastered_at = ?, dismissed_at = NULL`,
        )
        .bind(
          mistakeId,
          profileId,
          item.bankQuestionId,
          after,
          now,
          now,
          businessDate,
          mastered ? 'mastered' : 'active',
          item.isCorrect ? 0 : 1,
          streak,
          after,
          now,
          businessDate,
          item.isCorrect ? '+3 day' : '+1 day',
          mastered ? now : null,
        ),
      db
        .prepare(
          `INSERT INTO mistake_book_events (
             id, mistake_id, session_id, outcome, mastery_before, mastery_after, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          mistakeId,
          sessionId,
          item.isCorrect ? 'correct' : 'incorrect',
          before,
          after,
          now,
        ),
    )
  }
  if (statements.length > 0) await db.batch(statements)
}

export async function completeQuizSession(input: {
  db: D1Database
  profileId: string
  sessionId: string
  businessDate: string
}): Promise<QuizReport> {
  const session = await getSession(input.db, input.profileId, input.sessionId)
  if (!session)
    throw new QuizDomainError(
      'QUIZ_SESSION_NOT_FOUND',
      'Quiz session not found',
      404,
    )
  if (session.status === 'completed') return buildReport(input.db, session)
  const report = await buildReport(input.db, session)
  if (report.items.some((item) => item.response === '')) {
    throw new QuizDomainError(
      'QUIZ_INCOMPLETE',
      'Answer every question before completing',
      409,
    )
  }
  await updateMistakes(
    input.db,
    input.profileId,
    input.sessionId,
    report,
    input.businessDate,
  )
  const now = new Date().toISOString()
  await input.db
    .prepare(
      `UPDATE quiz_sessions SET status = 'completed', completed_at = ?,
       last_activity_at = ?, total_score = ?, correct_count = ?, total_duration_ms = ?
       WHERE id = ? AND status = 'in_progress'`,
    )
    .bind(
      now,
      now,
      report.score,
      report.correctCount,
      report.totalDurationMs,
      input.sessionId,
    )
    .run()
  return report
}

export async function getQuizReport(
  db: D1Database,
  profileId: string,
  sessionId?: string,
): Promise<QuizReport | undefined> {
  const row = sessionId
    ? await getSession(db, profileId, sessionId)
    : ((await db
        .prepare(
          `SELECT id, mode, status, question_fingerprint, degraded_reason, started_at,
                  report_deleted_at
           FROM quiz_sessions WHERE profile_id = ? AND status = 'completed'
             AND report_deleted_at IS NULL
           ORDER BY completed_at DESC LIMIT 1`,
        )
        .bind(profileId)
        .first<SessionRow>()) ?? undefined)
  if (!row || row.report_deleted_at) return undefined
  if (row.status !== 'completed') {
    throw new QuizDomainError(
      'QUIZ_NOT_COMPLETED',
      'Quiz report is not available yet',
      409,
    )
  }
  return buildReport(db, row)
}

export async function abandonQuizSession(input: {
  db: D1Database
  profileId: string
  sessionId: string
}): Promise<{ reset: true }> {
  const result = await input.db
    .prepare(
      `UPDATE quiz_sessions SET status = 'abandoned', last_activity_at = ?
       WHERE id = ? AND profile_id = ? AND status = 'in_progress'`,
    )
    .bind(new Date().toISOString(), input.sessionId, input.profileId)
    .run()
  if (result.meta.changes !== 1) {
    const owned = await input.db
      .prepare(
        `SELECT status FROM quiz_sessions
         WHERE id = ? AND profile_id = ? LIMIT 1`,
      )
      .bind(input.sessionId, input.profileId)
      .first<{ status: string }>()
    if (owned?.status === 'abandoned') return { reset: true }
    throw new QuizDomainError(
      'QUIZ_SESSION_NOT_RESETTABLE',
      'Active quiz session was not found',
      404,
    )
  }
  return { reset: true }
}

export async function deleteQuizReport(input: {
  db: D1Database
  profileId: string
  sessionId: string
}): Promise<{ deleted: true }> {
  const result = await input.db
    .prepare(
      `UPDATE quiz_sessions SET report_deleted_at = ?
       WHERE id = ? AND profile_id = ? AND status = 'completed'
         AND report_deleted_at IS NULL`,
    )
    .bind(new Date().toISOString(), input.sessionId, input.profileId)
    .run()
  if (result.meta.changes !== 1) {
    const owned = await input.db
      .prepare(
        `SELECT report_deleted_at FROM quiz_sessions
         WHERE id = ? AND profile_id = ? AND status = 'completed' LIMIT 1`,
      )
      .bind(input.sessionId, input.profileId)
      .first<{ report_deleted_at: string | null }>()
    if (owned?.report_deleted_at) return { deleted: true }
    throw new QuizDomainError(
      'QUIZ_REPORT_NOT_FOUND',
      'Quiz report was not found',
      404,
    )
  }
  return { deleted: true }
}

export async function listMistakes(db: D1Database, profileId: string) {
  const result = await db
    .prepare(
      `SELECT id, bank_question_id, status, error_count, correct_streak,
              mastery, next_review_date, mastered_at, dismissed_at
       FROM mistake_book WHERE profile_id = ? AND dismissed_at IS NULL
       ORDER BY status, next_review_date, last_reviewed_at DESC`,
    )
    .bind(profileId)
    .all<MistakeRow>()
  return result.results.map((row) => {
    const question = getBankQuestion(row.bank_question_id)
    return {
      id: row.id,
      bankQuestionId: row.bank_question_id,
      label: question?.context ?? question?.prompt ?? '历史题目',
      theme: question?.theme ?? '未知主题',
      status: row.status,
      errorCount: row.error_count,
      correctStreak: row.correct_streak,
      mastery: row.mastery,
      nextReviewDate: row.next_review_date,
    }
  })
}

export async function dismissMasteredMistake(input: {
  db: D1Database
  profileId: string
  mistakeId: string
}): Promise<{ dismissed: true }> {
  const result = await input.db
    .prepare(
      `UPDATE mistake_book SET dismissed_at = ?
       WHERE id = ? AND profile_id = ? AND status = 'mastered'
         AND dismissed_at IS NULL`,
    )
    .bind(new Date().toISOString(), input.mistakeId, input.profileId)
    .run()
  if (result.meta.changes !== 1) {
    throw new QuizDomainError(
      'MISTAKE_NOT_DISMISSIBLE',
      'Mastered mistake was not found',
      404,
    )
  }
  return { dismissed: true }
}

export function normalizeQuizSettings(value: {
  count: number
  types: QuestionType[]
  mode: QuizMode
}) {
  return {
    count: Math.min(20, Math.max(6, Math.trunc(value.count))),
    types: value.types.length > 0 ? [...new Set(value.types)] : allTypes,
    mode: value.mode,
  }
}
