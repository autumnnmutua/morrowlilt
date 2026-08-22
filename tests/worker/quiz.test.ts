import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { getBankQuestion, questionBank } from '../../worker/quiz/bank'
import {
  createSeedHex,
  generateQuiz,
  questionFingerprint,
} from '../../worker/quiz/generator'
import { normalizeAnswer, scoreAnswer } from '../../worker/quiz/scoring'
import type { QuestionType } from '../../worker/quiz/types'
import { ensureAppProfile } from '../../worker/services/learning'
import {
  completeQuizSession,
  createQuizSession,
  getActiveQuizSession,
  getQuizReport,
  listMistakes,
  submitQuizAnswer,
} from '../../worker/services/quiz'

const types: QuestionType[] = [
  'context_translation',
  'spelling',
  'cloze',
  'collocation_choice',
  'phrase_meaning',
]

function seed(value: number): string {
  return value.toString(16).padStart(64, '0')
}

async function profile(label: string) {
  const profileId = `${label}-${crypto.randomUUID()}`
  await ensureAppProfile({
    db: env.DB,
    profileId,
    timeZone: 'Asia/Shanghai',
    now: Date.parse('2026-08-20T04:00:00.000Z'),
  })
  return profileId
}

async function answerSession(
  profileId: string,
  session: Awaited<ReturnType<typeof createQuizSession>>,
  answerMode: 'correct' | 'wrong' | 'alternating',
) {
  for (const question of session.questions) {
    const bank = getBankQuestion(question.bankQuestionId)
    if (!bank)
      throw new Error(`Missing bank question ${question.bankQuestionId}`)
    const correct =
      answerMode === 'correct' ||
      (answerMode === 'alternating' && question.ordinal % 2 === 0)
    await submitQuizAnswer({
      db: env.DB,
      profileId,
      sessionId: session.id,
      questionId: question.id,
      response: correct ? bank.acceptableAnswers[0] : 'definitely-wrong',
      durationMs: 1_000 + question.ordinal * 250,
      idempotencyKey: `answer-${session.id}-${question.ordinal}`,
    })
  }
  return completeQuizSession({
    db: env.DB,
    profileId,
    sessionId: session.id,
    businessDate: '2026-08-20',
  })
}

describe('quiz generator and scoring', () => {
  it('keeps the expanded built-in question bank available', () => {
    expect(questionBank).toHaveLength(30)
  })
  it('keeps practice assessment focused on vocabulary and phrases without writing questions', () => {
    expect(new Set(questionBank.map((question) => question.type))).toEqual(
      new Set(types),
    )
    expect(
      questionBank.some((question) =>
        /essay|writing task|作文|写作题/i.test(
          `${question.prompt} ${question.context}`,
        ),
      ),
    ).toBe(false)
  })

  it('uses 256-bit Web Crypto seeds and reproduces the same ordered set', async () => {
    expect(createSeedHex()).toMatch(/^[0-9a-f]{64}$/)
    const input = {
      seedHex: seed(7),
      count: 10,
      types,
      mode: 'mixed' as const,
      recentFingerprints: [],
    }
    const first = await generateQuiz(input)
    const second = await generateQuiz(input)
    expect(first.questions.map((item) => item.id)).toEqual(
      second.questions.map((item) => item.id),
    )
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fingerprint).toBe(
      await questionFingerprint('mixed', first.questions),
    )
  })

  it('resamples an exact recent fingerprint while retaining deterministic output', async () => {
    const first = await generateQuiz({
      seedHex: seed(8),
      count: 8,
      types,
      mode: 'mixed',
      recentFingerprints: [],
    })
    const resampled = await generateQuiz({
      seedHex: seed(8),
      count: 8,
      types,
      mode: 'mixed',
      recentFingerprints: [first.fingerprint],
    })
    expect(resampled.fingerprint).not.toBe(first.fingerprint)
    expect(resampled.questions.map((item) => item.id)).not.toEqual(
      first.questions.map((item) => item.id),
    )
  })

  it('normalizes accepted answers and tolerates one minor long-word typo', () => {
    const spelling = questionBank.find(
      (item) => item.id === 'spell-sustainable',
    )
    if (!spelling) throw new Error('Fixture missing')
    expect(normalizeAnswer('  SUSTAINABLE！ ')).toBe('sustainable')
    expect(scoreAnswer(spelling, 'sustainble')).toMatchObject({
      isCorrect: true,
      score: 1,
    })
    expect(scoreAnswer(spelling, 'sustained')).toMatchObject({
      isCorrect: false,
      errorReason: 'spelling_error',
    })
  })
})

describe('quiz sessions, reports, and mistake mastery', () => {
  it('serves a safe session snapshot through the Worker API', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/api/quiz/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `api-create-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ count: 6, mode: 'mixed', types }),
      }),
    )
    expect(response.status).toBe(201)
    const body = await response.json<{ data: { questions: unknown[] } }>()
    expect(body.data.questions).toHaveLength(6)
    expect(JSON.stringify(body)).not.toMatch(
      /standardAnswer|acceptableAnswers|explanation/i,
    )

    const resumed = await exports.default.fetch(
      new Request('https://example.invalid/api/quiz/sessions'),
    )
    expect(resumed.status).toBe(200)
    const resumedBody = await resumed.json<{
      data: { questions: unknown[]; answeredQuestionIds: string[] }
    }>()
    expect(Array.isArray(resumedBody.data.questions)).toBe(true)
    expect(resumedBody.data.answeredQuestionIds).toEqual([])
  })

  it('creates three distinct sessions, hides answers, and produces report examples', async () => {
    const profileId = await profile('three-demo-sessions')
    const sessions = []
    const reports = []
    for (const [index, mode] of ['correct', 'alternating', 'wrong'].entries()) {
      const session = await createQuizSession({
        db: env.DB,
        profileId,
        idempotencyKey: `create-demo-${index}-${crypto.randomUUID()}`,
        count: 6,
        types,
        mode: 'mixed',
        seedHex: seed(100 + index),
      })
      sessions.push(session)
      expect(JSON.stringify(session)).not.toMatch(
        /standardAnswer|acceptableAnswers|explanation/i,
      )
      reports.push(
        await answerSession(
          profileId,
          session,
          mode as 'correct' | 'wrong' | 'alternating',
        ),
      )
    }
    expect(new Set(sessions.map((item) => item.questionFingerprint)).size).toBe(
      3,
    )
    expect(reports.map((item) => item.correctCount)).toEqual([6, 3, 0])
    expect(reports[1].byType.length).toBeGreaterThanOrEqual(3)
    expect(reports[1].byTheme.length).toBeGreaterThanOrEqual(3)
    expect(reports[1].totalDurationMs).toBe(9_750)
    expect(reports[2].weaknesses.length).toBeGreaterThan(0)
  })

  it('makes creation and answer submission idempotent and resumes midway', async () => {
    const profileId = await profile('resume-idempotent')
    const key = `create-resume-${crypto.randomUUID()}`
    const created = await createQuizSession({
      db: env.DB,
      profileId,
      idempotencyKey: key,
      count: 6,
      types,
      mode: 'mixed',
      seedHex: seed(220),
    })
    const duplicate = await createQuizSession({
      db: env.DB,
      profileId,
      idempotencyKey: key,
      count: 6,
      types,
      mode: 'mixed',
      seedHex: seed(999),
    })
    expect(duplicate.id).toBe(created.id)

    const first = created.questions[0]
    const bank = getBankQuestion(first.bankQuestionId)
    if (!bank) throw new Error('Fixture missing')
    const submitInput = {
      db: env.DB,
      profileId,
      sessionId: created.id,
      questionId: first.id,
      response: bank.standardAnswer,
      durationMs: 1_234,
      idempotencyKey: `submit-repeat-${crypto.randomUUID()}`,
    }
    await submitQuizAnswer(submitInput)
    await submitQuizAnswer({ ...submitInput, response: 'wrong second click' })
    const resumed = await getActiveQuizSession(env.DB, profileId)
    expect(resumed?.id).toBe(created.id)
    expect(resumed?.answeredQuestionIds).toEqual([first.id])
    const answerCount = await env.DB.prepare(
      'SELECT count(*) AS count FROM quiz_answers WHERE session_id = ?',
    )
      .bind(created.id)
      .first<{ count: number }>()
    expect(answerCount?.count).toBe(1)
  })

  it('keeps mistake history and marks an item mastered after repeated correct reviews', async () => {
    const profileId = await profile('mastery')
    const original = await createQuizSession({
      db: env.DB,
      profileId,
      idempotencyKey: `mastery-original-${crypto.randomUUID()}`,
      count: 6,
      types,
      mode: 'mixed',
      seedHex: seed(300),
    })
    await answerSession(profileId, original, 'wrong')
    const firstMistake = (await listMistakes(env.DB, profileId))[0]
    expect(firstMistake).toMatchObject({ status: 'active', mastery: 20 })

    for (let index = 0; index < 3; index += 1) {
      const review = await createQuizSession({
        db: env.DB,
        profileId,
        idempotencyKey: `mastery-review-${index}-${crypto.randomUUID()}`,
        count: 6,
        types,
        mode: 'mistake_retest',
        seedHex: seed(310 + index),
      })
      await answerSession(profileId, review, 'correct')
    }
    const mastered = (await listMistakes(env.DB, profileId)).find(
      (item) => item.bankQuestionId === firstMistake.bankQuestionId,
    )
    expect(mastered).toMatchObject({ status: 'mastered', mastery: 95 })
    const history = await env.DB.prepare(
      `SELECT count(*) AS count FROM mistake_book_events WHERE mistake_id = ?`,
    )
      .bind(firstMistake.id)
      .first<{ count: number }>()
    expect(history?.count).toBe(4)
  })

  it('returns the same completed report without applying mastery twice', async () => {
    const profileId = await profile('complete-idempotent')
    const session = await createQuizSession({
      db: env.DB,
      profileId,
      idempotencyKey: `complete-once-${crypto.randomUUID()}`,
      count: 6,
      types,
      mode: 'mixed',
      seedHex: seed(400),
    })
    const first = await answerSession(profileId, session, 'alternating')
    const eventsBefore = await env.DB.prepare(
      'SELECT count(*) AS count FROM mistake_book_events WHERE session_id = ?',
    )
      .bind(session.id)
      .first<{ count: number }>()
    const second = await completeQuizSession({
      db: env.DB,
      profileId,
      sessionId: session.id,
      businessDate: '2026-08-20',
    })
    const eventsAfter = await env.DB.prepare(
      'SELECT count(*) AS count FROM mistake_book_events WHERE session_id = ?',
    )
      .bind(session.id)
      .first<{ count: number }>()
    expect(second).toEqual(first)
    expect(eventsAfter).toEqual(eventsBefore)
    expect(
      (await getQuizReport(env.DB, profileId, session.id))?.sessionId,
    ).toBe(session.id)
  })
})
