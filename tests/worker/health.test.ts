import { env, exports } from 'cloudflare:workers'
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import worker from '../../worker/index'

describe('Worker API and D1 integration', () => {
  it('returns an ok health response after a real D1 query', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/api/health'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'daily-english-study',
      checks: { database: 'ok' },
    })
  })

  it('persists seed content before returning it and keeps the snapshot stable', async () => {
    const url = 'https://example.invalid/api/daily-content?date=2026-08-20'
    const first = await exports.default.fetch(new Request(url))
    const second = await exports.default.fetch(new Request(url))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = await first.json<{
      data: { id: string; source: string; contentDate: string }
    }>()
    const secondBody = await second.json<{
      data: { id: string; source: string; contentDate: string }
    }>()
    expect(firstBody.data).toMatchObject({
      source: 'seed',
      contentDate: '2026-08-20',
    })
    expect(secondBody.data.id).toBe(firstBody.data.id)

    const stored = await env.DB.prepare(
      'SELECT content_date, source FROM daily_content WHERE content_date = ?',
    )
      .bind('2026-08-20')
      .first<{ content_date: string; source: string }>()
    expect(stored).toEqual({ content_date: '2026-08-20', source: 'seed' })
  })

  it('uses a different built-in seed when no online Provider is configured', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/api/daily-content?date=2026-08-21'),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        contentDate: '2026-08-21',
        source: 'seed',
      },
    })
  })

  it('runs scheduled work through waitUntil and records a mocked email', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({ id: 'scheduled-message-fixture' }, { status: 200 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = createScheduledController({
      scheduledTime: Date.parse('2026-08-22T00:00:00.000Z'),
      cron: '0 * * * *',
    })
    const ctx = createExecutionContext()

    worker.scheduled(controller, env, ctx)
    await waitOnExecutionContext(ctx)

    const businessDate = '2026-08-22'
    const stored = await env.DB.prepare(
      'SELECT content_date FROM daily_content WHERE content_date = ?',
    )
      .bind(businessDate)
      .first<{ content_date: string }>()
    expect(stored?.content_date).toBe(businessDate)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns structured validation and not-found errors', async () => {
    const invalid = await exports.default.fetch(
      new Request('https://example.invalid/api/daily-content?date=2026-02-30'),
    )
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: 'INVALID_CONTENT_DATE' },
    })

    const missing = await exports.default.fetch(
      new Request('https://example.invalid/api/missing'),
    )
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })
})
