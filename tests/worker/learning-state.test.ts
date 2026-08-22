import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { getLearningProgress } from '../../worker/repository/learning'
import {
  ensureAppProfile,
  getPendingBundle,
  markLearned,
  markNotLearned,
  undoTodayLearned,
} from '../../worker/services/learning'

function profileId(label: string): string {
  return `${label}-${crypto.randomUUID()}`
}

async function createProfile(
  label: string,
  createdDate: string,
  timeZone = 'Asia/Shanghai',
) {
  const id = profileId(label)
  await ensureAppProfile({
    db: env.DB,
    profileId: id,
    timeZone,
    now: Date.parse(`${createdDate}T04:00:00.000Z`),
  })
  return id
}

describe('learning progress invariants', () => {
  it('starts one day before profile creation and never backfills older dates', async () => {
    const id = await createProfile('first-use', '2026-08-20')
    const bundle = await getPendingBundle({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
    })

    expect(bundle.profile.createdDate).toBe('2026-08-20')
    expect(bundle.progress.settledThroughDate).toBe('2026-08-19')
    expect(bundle.days.map((day) => day.contentDate)).toEqual(['2026-08-20'])
  })

  it('does not advance progress when the user merely reads the bundle', async () => {
    const id = await createProfile('no-click', '2026-08-20')
    await getPendingBundle({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
    })

    expect((await getLearningProgress(env.DB, id)).settledThroughDate).toBe(
      '2026-08-19',
    )
    const eventCount = await env.DB.prepare(
      'SELECT count(*) AS count FROM checkin_events WHERE profile_id = ?',
    )
      .bind(id)
      .first<{ count: number }>()
    expect(eventCount?.count).toBe(0)
  })

  it('keeps every unlearned day in ascending order without advancing settled', async () => {
    const id = await createProfile('continuous', '2026-08-20')
    await markNotLearned({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
      idempotencyKey: 'not-learned-20260820',
    })
    const bundle = await getPendingBundle({
      db: env.DB,
      profileId: id,
      today: '2026-08-22',
    })

    expect(bundle.progress.settledThroughDate).toBe('2026-08-19')
    expect(bundle.days.map((day) => day.contentDate)).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ])
  })

  it('settles the whole bundle and starts with only new content next day', async () => {
    const id = await createProfile('next-day', '2026-08-20')
    await markLearned({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
      idempotencyKey: 'learned-20260820-next',
    })
    const nextDay = await getPendingBundle({
      db: env.DB,
      profileId: id,
      today: '2026-08-21',
    })

    expect(nextDay.progress.settledThroughDate).toBe('2026-08-20')
    expect(nextDay.days.map((day) => day.contentDate)).toEqual(['2026-08-21'])
  })

  it('restores previous_settled on a same-business-day undo', async () => {
    const id = await createProfile('undo', '2026-08-20')
    const learned = await markLearned({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
      idempotencyKey: 'learned-20260820-undo',
    })
    expect(learned.event?.previousSettledDate).toBe('2026-08-19')

    const undone = await undoTodayLearned({
      db: env.DB,
      profileId: id,
      today: '2026-08-20',
      idempotencyKey: 'undo-20260820-same-day',
    })
    expect(undone.progress.settledThroughDate).toBe('2026-08-19')
    expect(undone.event?.reversesEventId).toBe(learned.event?.id)
  })

  it('deduplicates simultaneous repeated learned requests', async () => {
    const id = await createProfile('concurrent', '2026-08-20')
    const key = 'concurrent-repeat-20260820'
    await Promise.all([
      markLearned({
        db: env.DB,
        profileId: id,
        today: '2026-08-20',
        idempotencyKey: key,
      }),
      markLearned({
        db: env.DB,
        profileId: id,
        today: '2026-08-20',
        idempotencyKey: key,
      }),
    ])

    const progress = await getLearningProgress(env.DB, id)
    expect(progress).toMatchObject({
      settledThroughDate: '2026-08-20',
      version: 1,
    })
    const eventCount = await env.DB.prepare(
      `SELECT count(*) AS count FROM checkin_events
       WHERE profile_id = ? AND event_type = 'learned'`,
    )
      .bind(id)
      .first<{ count: number }>()
    expect(eventCount?.count).toBe(1)
  })
})

describe('learning API integration', () => {
  it('returns real today data and supports learned then same-day undo', async () => {
    const todayResponse = await exports.default.fetch(
      new Request('https://example.invalid/api/today'),
    )
    expect(todayResponse.status).toBe(200)
    const todayBody = await todayResponse.json<{
      data: { today: string; learningState: string; pendingDayCount: number }
    }>()
    expect(todayBody.data).toMatchObject({
      learningState: 'unsettled',
      pendingDayCount: 1,
    })

    const learnedResponse = await exports.default.fetch(
      new Request('https://example.invalid/api/checkin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'api-learned-integration',
        },
        body: JSON.stringify({ action: 'learned' }),
      }),
    )
    expect(learnedResponse.status).toBe(200)
    await expect(learnedResponse.json()).resolves.toMatchObject({
      data: { learningState: 'settled', pendingDayCount: 0 },
      mutation: { changed: true },
    })

    const undoResponse = await exports.default.fetch(
      new Request('https://example.invalid/api/checkin/undo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'api-undo-integration',
        },
        body: '{}',
      }),
    )
    expect(undoResponse.status).toBe(200)
    await expect(undoResponse.json()).resolves.toMatchObject({
      data: {
        today: todayBody.data.today,
        learningState: 'unsettled',
        pendingDayCount: 1,
      },
      mutation: { changed: true },
    })
  })

  it('rejects missing idempotency keys and malformed actions', async () => {
    const missingKey = await exports.default.fetch(
      new Request('https://example.invalid/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'learned' }),
      }),
    )
    expect(missingKey.status).toBe(400)
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: 'INVALID_IDEMPOTENCY_KEY' },
    })

    const invalidAction = await exports.default.fetch(
      new Request('https://example.invalid/api/checkin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'api-invalid-action',
        },
        body: JSON.stringify({ action: 'maybe' }),
      }),
    )
    expect(invalidAction.status).toBe(400)
    await expect(invalidAction.json()).resolves.toMatchObject({
      error: { code: 'INVALID_CHECKIN_ACTION' },
    })
  })
})
