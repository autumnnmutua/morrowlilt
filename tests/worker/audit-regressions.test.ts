import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAppProfile } from '../../worker/services/learning'
import {
  ensureAccountForIdentity,
  disableAccount,
} from '../../worker/repository/accounts'
import {
  requestEmailBinding,
  stopEmailSubscription,
} from '../../worker/services/email-subscription'
import {
  savePendingEmailSubscription,
  unsubscribeEmail,
  verifyPendingEmailSubscription,
} from '../../worker/repository/email-subscription'
import { hashEmailRecipient } from '../../worker/repository/email-delivery'
import {
  previewDailyEmail,
  runScheduledDailyJob,
} from '../../worker/services/scheduled-job'
import { ensureProfileDailyContent } from '../../worker/services/profile-daily-content'
import {
  abandonQuizSession,
  completeQuizSession,
  createQuizSession,
  submitQuizAnswer,
} from '../../worker/services/quiz'
import { fetchJsonWithPolicy } from '../../worker/http/fetch-json'
import { renderDailyEmail } from '../../worker/email/render'
import type { DailyEmailMessage } from '../../worker/providers/contracts'

afterEach(() => vi.unstubAllGlobals())

async function profile(id = `audit-${crypto.randomUUID()}`) {
  await ensureAppProfile({
    db: env.DB,
    profileId: id,
    timeZone: 'Asia/Shanghai',
    now: new Date('2026-08-20T00:00:00Z'),
  })
  return id
}

describe('audit regressions', () => {
  it('does not reactivate a disabled account through GET or a POST without an idempotency key', async () => {
    const identity = {
      issuer: 'https://local.invalid',
      subject: 'audit-reauthorize',
      email: ['audit-owner', 'example.invalid'].join('@'),
    }
    const account = await ensureAccountForIdentity({
      db: env.DB,
      identity,
      defaultTimeZone: 'Asia/Shanghai',
    })
    await disableAccount(env.DB, account.profileId)
    const headers = {
      'x-morrowlilt-test-subject': identity.subject,
      'x-morrowlilt-test-email': identity.email,
    }
    for (const method of ['GET', 'POST']) {
      const response = await exports.default.fetch(
        new Request('https://audit.invalid/api/account/reauthorize', {
          method,
          headers,
        }),
      )
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(
        await env.DB.prepare('SELECT status FROM accounts WHERE profile_id = ?')
          .bind(account.profileId)
          .first('status'),
      ).toBe('disabled')
    }
    const restored = await exports.default.fetch(
      new Request('https://audit.invalid/api/account/reauthorize', {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': 'audit-reauthorize-once' },
      }),
    )
    expect(restored.status).toBe(200)
  })

  it('rejects future or pre-account content generation without consuming the seed bank', async () => {
    for (const route of ['daily-content', 'daily-package']) {
      for (const date of ['2000-01-01', '9999-12-31']) {
        const response = await exports.default.fetch(
          new Request(`https://audit.invalid/api/${route}?date=${date}`),
        )
        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({
          error: { code: 'CONTENT_DATE_OUT_OF_RANGE' },
        })
      }
    }
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM profile_daily_content',
      ).first('count'),
    ).toBe(0)
  })

  it('sends just one confirmation for concurrent first binding with the same key', async () => {
    const profileId = await profile()
    const messages: DailyEmailMessage[] = []
    const input = {
      db: env.DB,
      profileId,
      timeZone: 'Asia/Shanghai',
      rawEmail: ['concurrent-binding', 'example.invalid'].join('@'),
      idempotencyKey: 'audit-concurrent-binding',
      provider: {
        name: 'audit',
        sendDailyDigest: (message: DailyEmailMessage) => {
          messages.push(message)
          return Promise.resolve({ messageId: 'audit-message' })
        },
      },
      mailFrom: ['Study <mail', 'example.invalid>'].join('@'),
      publicSiteUrl: 'https://audit.invalid',
    }
    await Promise.all([
      requestEmailBinding(input),
      requestEmailBinding(input),
      requestEmailBinding(input),
    ])
    expect(messages).toHaveLength(1)
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM email_subscription_events',
      ).first('count'),
    ).toBe(1)
  })

  it('uses distinct provider keys for concurrent replacement confirmations', async () => {
    const profileId = await profile()
    const keys: string[] = []
    await Promise.all(
      ['first', 'second'].map((label) =>
        requestEmailBinding({
          db: env.DB,
          profileId,
          timeZone: 'UTC',
          rawEmail: [`audit-${label}`, 'example.invalid'].join('@'),
          idempotencyKey: `audit-replace-${label}`,
          provider: {
            name: 'audit',
            sendDailyDigest: (message: DailyEmailMessage) => {
              keys.push(message.idempotencyKey)
              return Promise.resolve({ messageId: 'audit-message' })
            },
          },
          mailFrom: ['mail', 'example.invalid'].join('@'),
          publicSiteUrl: 'https://audit.invalid',
        }),
      ),
    )
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })

  it('does not let an in-flight duplicate unsubscribe cancel a later binding', async () => {
    const profileId = await profile()
    const email = ['audit-rebind', 'example.invalid'].join('@')
    const pending = {
      db: env.DB,
      profileId,
      email,
      emailHash: await hashEmailRecipient(email),
      timeZone: 'UTC',
      verificationTokenHash: 'd'.repeat(64),
      verificationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: 'audit-before-unsubscribe',
    }
    await savePendingEmailSubscription(pending)
    const batch = env.DB.batch.bind(env.DB)
    const db = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            await unsubscribeEmail(env.DB, profileId, 'audit-unsubscribe-once')
            await savePendingEmailSubscription({
              ...pending,
              idempotencyKey: 'audit-after-unsubscribe',
            })
            return batch(statements)
          }
        const value: unknown = Reflect.get(target, property)
        const bound: unknown =
          typeof value === 'function' ? value.bind(target) : value
        return bound
      },
    })
    expect(
      (await unsubscribeEmail(db, profileId, 'audit-unsubscribe-once'))?.status,
    ).toBe('pending')
  })

  it('rejects an old confirmation if the mailbox changes between lookup and write', async () => {
    const profileId = await profile()
    const email = ['original', 'example.invalid'].join('@')
    const pending = {
      db: env.DB,
      profileId,
      email,
      emailHash: await hashEmailRecipient(email),
      timeZone: 'Asia/Shanghai',
      verificationTokenHash: 'a'.repeat(64),
      verificationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: 'audit-original-binding',
    }
    await savePendingEmailSubscription(pending)
    const replacement = ['replacement', 'example.invalid'].join('@')
    const batch = env.DB.batch.bind(env.DB)
    const db = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            await savePendingEmailSubscription({
              ...pending,
              email: replacement,
              emailHash: await hashEmailRecipient(replacement),
              verificationTokenHash: 'b'.repeat(64),
              idempotencyKey: 'audit-replacement-binding',
            })
            return batch(statements)
          }
        const value: unknown = Reflect.get(target, property)
        const bound: unknown =
          typeof value === 'function' ? value.bind(target) : value
        return bound
      },
    })
    expect(
      await verifyPendingEmailSubscription(
        db,
        profileId,
        'a'.repeat(64),
        'audit-verify-old-token',
      ),
    ).toBeUndefined()
    expect(
      await env.DB.prepare(
        'SELECT email_status FROM users WHERE profile_id = ?',
      )
        .bind(profileId)
        .first('email_status'),
    ).toBe('pending')
  })

  it('honours the default subscription opt-out and account disable with platform secrets configured', async () => {
    const owner = ['local-user', 'example.invalid'].join('@')
    await ensureAccountForIdentity({
      db: env.DB,
      identity: {
        issuer: 'https://local.invalid',
        subject: 'local-default',
        email: owner,
      },
      ownerEmail: owner,
      defaultTimeZone: 'Asia/Shanghai',
    })
    await savePendingEmailSubscription({
      db: env.DB,
      profileId: 'default',
      email: owner,
      emailHash: await hashEmailRecipient(owner),
      timeZone: 'Asia/Shanghai',
      verificationTokenHash: 'c'.repeat(64),
      verificationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: 'audit-owner-binding',
    })
    await stopEmailSubscription({
      db: env.DB,
      profileId: 'default',
      timeZone: 'Asia/Shanghai',
      idempotencyKey: 'audit-owner-stop',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await runScheduledDailyJob(Date.parse('2026-11-09T00:00:00Z'), env)
    await disableAccount(env.DB, 'default')
    await runScheduledDailyJob(Date.parse('2026-11-10T00:00:00Z'), env)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM email_deliveries',
      ).first('count'),
    ).toBe(0)
  })

  it('keeps the configured owner recipient while a replacement mailbox is unconfirmed', async () => {
    await profile('default')
    await env.DB.prepare(
      "UPDATE accounts SET status = 'active' WHERE profile_id = 'default'",
    ).run()
    const replacement = ['unconfirmed-owner', 'example.invalid'].join('@')
    await savePendingEmailSubscription({
      db: env.DB,
      profileId: 'default',
      email: replacement,
      emailHash: await hashEmailRecipient(replacement),
      timeZone: 'UTC',
      verificationTokenHash: 'e'.repeat(64),
      verificationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: 'audit-pending-owner',
    })
    const recipients: string[][] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected JSON body')
        const payload = JSON.parse(init.body) as { to: string[] }
        recipients.push(payload.to)
        return Promise.resolve(Response.json({ id: 'audit-owner-delivery' }))
      }),
    )
    await runScheduledDailyJob(Date.parse('2026-11-11T00:00:00Z'), env)
    expect(recipients).toEqual([[env.RECIPIENT_EMAIL]])
    expect(recipients.flat()).not.toContain(replacement)
  })

  it('renders administrator preview from the exact personal website snapshot', async () => {
    await profile('default')
    const daily = await ensureProfileDailyContent({
      db: env.DB,
      profileId: 'default',
      contentDate: '2026-08-22',
      timeZone: 'Asia/Shanghai',
    })
    const publicSiteUrl = 'https://audit.invalid'
    expect(
      await previewDailyEmail({
        env,
        contentDate: daily.contentDate,
        publicSiteUrl,
      }),
    ).toEqual(renderDailyEmail(daily, publicSiteUrl))
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM daily_content').first(
        'count',
      ),
    ).toBe(0)
  })

  it('can finish a submitted blank answer and cannot finish an abandoned session', async () => {
    const profileId = await profile()
    const session = await createQuizSession({
      db: env.DB,
      profileId,
      count: 6,
      mode: 'mixed',
      types: ['spelling'],
      idempotencyKey: 'audit-blank-session',
    })
    for (const question of session.questions)
      await submitQuizAnswer({
        db: env.DB,
        profileId,
        sessionId: session.id,
        questionId: question.id,
        response: '',
        durationMs: 10,
        idempotencyKey: `audit-blank-${question.ordinal}`,
      })
    expect(
      (
        await completeQuizSession({
          db: env.DB,
          profileId,
          sessionId: session.id,
          businessDate: '2026-08-22',
        })
      ).correctCount,
    ).toBe(0)
    const abandoned = await createQuizSession({
      db: env.DB,
      profileId,
      count: 6,
      mode: 'mixed',
      types: ['spelling'],
      idempotencyKey: 'audit-abandoned-session',
    })
    await abandonQuizSession({ db: env.DB, profileId, sessionId: abandoned.id })
    await expect(
      completeQuizSession({
        db: env.DB,
        profileId,
        sessionId: abandoned.id,
        businessDate: '2026-08-22',
      }),
    ).rejects.toMatchObject({ code: 'QUIZ_NOT_ACTIVE' })
  })

  it('does not fetch after a parent abort and cancels rejected upstream bodies', async () => {
    const controller = new AbortController()
    controller.abort('cancelled')
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('failure', { status: 503 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const policy = {
      operation: 'audit',
      maxAttempts: 1,
      validate: (value: unknown): value is object =>
        value !== null && typeof value === 'object',
    }
    await expect(
      fetchJsonWithPolicy(
        'https://audit.invalid',
        {},
        policy,
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'EXTERNAL_ABORTED' })
    expect(fetchMock).not.toHaveBeenCalled()
    const cancel = vi.fn()
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(new ReadableStream({ cancel }), { status: 503 }),
      ),
    )
    await expect(
      fetchJsonWithPolicy('https://audit.invalid', {}, policy),
    ).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_ERROR' })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
