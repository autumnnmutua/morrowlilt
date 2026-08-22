import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DailyEmailMessage,
  EmailProvider,
} from '../../worker/providers/contracts'
import {
  disableAccount,
  ensureAccountForIdentity,
  hashIdentityValue,
} from '../../worker/repository/accounts'
import {
  configureUserEmailProvider,
  requestEmailBinding,
} from '../../worker/services/email-subscription'
import { ensureAppProfile } from '../../worker/services/learning'
import { runScheduledDailyJob } from '../../worker/services/scheduled-job'

const types = [
  'context_translation',
  'spelling',
  'cloze',
  'collocation_choice',
  'phrase_meaning',
]

function identityHeaders(label: string): Record<string, string> {
  return {
    'x-morrowlilt-test-subject': `subject-${label}`,
    'x-morrowlilt-test-email': [`${label}-user`, 'example.invalid'].join('@'),
  }
}

function api(label: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(identityHeaders(label))) {
    headers.set(name, value)
  }
  return exports.default.fetch(
    new Request(`https://multi-user.invalid${path}`, { ...init, headers }),
  )
}

class VerificationProvider implements EmailProvider {
  readonly name = 'verification-fixture'
  readonly messages: DailyEmailMessage[] = []

  sendDailyDigest(message: DailyEmailMessage): Promise<{ messageId: string }> {
    this.messages.push(message)
    return Promise.resolve({ messageId: crypto.randomUUID() })
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('multi-user account and ownership boundaries', () => {
  it('provisions concurrent first login once and preserves the profile on reauthorization', async () => {
    const identity = {
      issuer: 'https://local.invalid',
      subject: 'concurrent-first-login',
      email: ['concurrent-user', 'example.invalid'].join('@'),
    }
    const provision = () =>
      ensureAccountForIdentity({
        db: env.DB,
        identity,
        defaultTimeZone: 'Asia/Shanghai',
      })
    const accounts = await Promise.all([provision(), provision(), provision()])
    expect(new Set(accounts.map((item) => item.profileId)).size).toBe(1)

    const original = accounts[0]
    await disableAccount(env.DB, original.profileId)
    await expect(provision()).rejects.toThrow('ACCOUNT_DISABLED')
    const restored = await ensureAccountForIdentity({
      db: env.DB,
      identity,
      defaultTimeZone: 'Asia/Shanghai',
      allowReauthorize: true,
    })
    expect(restored).toMatchObject({
      profileId: original.profileId,
      status: 'active',
    })
  })

  it('keeps same-day content stable per account and different across accounts', async () => {
    const [aFirst, bFirst] = await Promise.all([
      api('stable-a', '/api/today'),
      api('stable-b', '/api/today'),
    ])
    expect(aFirst.status).toBe(200)
    expect(bFirst.status).toBe(200)
    const a = await aFirst.json<{
      data: { todayContent: { fingerprint: string; id: string } }
    }>()
    const b = await bFirst.json<{
      data: { todayContent: { fingerprint: string; id: string } }
    }>()
    expect(a.data.todayContent.fingerprint).not.toBe(
      b.data.todayContent.fingerprint,
    )

    const refreshed = await api('stable-a', '/api/today')
    const aAgain = await refreshed.json<{
      data: { todayContent: { fingerprint: string; id: string } }
    }>()
    expect(aAgain.data.todayContent).toEqual(a.data.todayContent)
  })

  it('isolates progress and makes another account quiz session unguessable', async () => {
    const beforeB = await api('isolation-b', '/api/today')
    const bStart = await beforeB.json<{
      data: { settledThroughDate: string }
    }>()

    const learned = await api('isolation-a', '/api/checkin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `learn-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ action: 'learned' }),
    })
    expect(learned.status).toBe(200)
    const afterB = await api('isolation-b', '/api/today')
    const bEnd = await afterB.json<{ data: { settledThroughDate: string } }>()
    expect(bEnd.data.settledThroughDate).toBe(bStart.data.settledThroughDate)

    const created = await api('isolation-a', '/api/quiz/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `quiz-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ count: 6, mode: 'mixed', types }),
    })
    expect(created.status).toBe(201)
    const session = await created.json<{ data: { id: string } }>()
    const guessed = await api(
      'isolation-b',
      `/api/quiz/sessions/${encodeURIComponent(session.data.id)}`,
    )
    expect([403, 404]).toContain(guessed.status)

    const profiles = await env.DB.prepare(
      `SELECT identity.subject, account.profile_id
       FROM auth_identities AS identity
       JOIN accounts AS account ON account.id = identity.account_id
       WHERE identity.subject IN ('subject-isolation-a', 'subject-isolation-b')`,
    ).all<{ subject: string; profile_id: string }>()
    const profileA = profiles.results.find(
      (item) => item.subject === 'subject-isolation-a',
    )?.profile_id
    const profileB = profiles.results.find(
      (item) => item.subject === 'subject-isolation-b',
    )?.profile_id
    if (!profileA || !profileB) throw new Error('Account fixtures missing')

    for (const label of ['isolation-a', 'isolation-b']) {
      const favorite = await api(label, '/api/dictionary/favorites', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `favorite-${label}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ term: 'resilient' }),
      })
      expect(favorite.status).toBe(200)
    }
    const favoriteOwners = await env.DB.prepare(
      `SELECT profile_id FROM dictionary_favorites
       WHERE normalized_term = 'resilient' AND profile_id IN (?, ?)`,
    )
      .bind(profileA, profileB)
      .all<{ profile_id: string }>()
    expect(
      new Set(favoriteOwners.results.map((item) => item.profile_id)),
    ).toEqual(new Set([profileA, profileB]))

    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO mistake_book (
         id, profile_id, bank_question_id, status, error_count, correct_streak,
         mastery, first_wrong_at, last_reviewed_at, next_review_date, mastered_at
       ) VALUES (?, ?, 'ctx-resilient', 'active', 1, 0, 20, ?, ?, '2000-01-01', NULL)`,
    )
      .bind(crypto.randomUUID(), profileA, now, now)
      .run()
    const [mistakesA, mistakesB] = await Promise.all([
      api('isolation-a', '/api/mistakes'),
      api('isolation-b', '/api/mistakes'),
    ])
    const mistakeBodyA = await mistakesA.json<{ data: unknown[] }>()
    const mistakeBodyB = await mistakesB.json<{ data: unknown[] }>()
    expect(mistakeBodyA.data).toHaveLength(1)
    expect(mistakeBodyB.data).toHaveLength(0)

    const progressBeforeEmailChange = await env.DB.prepare(
      `SELECT settled_through_date, version FROM learning_progress
       WHERE profile_id = ?`,
    )
      .bind(profileA)
      .first<{ settled_through_date: string; version: number }>()
    const provider = new VerificationProvider()
    for (const suffix of ['first', 'replacement']) {
      await requestEmailBinding({
        db: env.DB,
        profileId: profileA,
        timeZone: 'Asia/Shanghai',
        rawEmail: [`${suffix}-mailbox`, 'example.invalid'].join('@'),
        idempotencyKey: `email-change-${suffix}-${crypto.randomUUID()}`,
        provider,
        mailFrom: ['Study <mail', 'example.invalid>'].join('@'),
        publicSiteUrl: 'https://multi-user.invalid',
      })
    }
    const progressAfterEmailChange = await env.DB.prepare(
      `SELECT settled_through_date, version FROM learning_progress
       WHERE profile_id = ?`,
    )
      .bind(profileA)
      .first<{ settled_through_date: string; version: number }>()
    expect(progressAfterEmailChange).toEqual(progressBeforeEmailChange)
    const bEmailSettings = await api('isolation-b', '/api/email/settings')
    const bEmailBody = await bEmailSettings.json<{
      data: { maskedEmail?: string }
    }>()
    expect(bEmailBody.data.maskedEmail).toBeUndefined()
  })

  it('prevents one email address from being bound to two profiles under concurrency', async () => {
    const profileIds = ['email-owner-a', 'email-owner-b']
    await Promise.all(
      profileIds.map((profileId) =>
        ensureAppProfile({
          db: env.DB,
          profileId,
          timeZone: 'Asia/Shanghai',
        }),
      ),
    )
    const provider = new VerificationProvider()
    const sharedEmail = ['shared-recipient', 'example.invalid'].join('@')
    const attempts = await Promise.allSettled(
      profileIds.map((profileId) =>
        requestEmailBinding({
          db: env.DB,
          profileId,
          timeZone: 'Asia/Shanghai',
          rawEmail: sharedEmail,
          idempotencyKey: `bind-${profileId}-${crypto.randomUUID()}`,
          provider,
          mailFrom: ['Study <mail', 'example.invalid>'].join('@'),
          publicSiteUrl: 'https://multi-user.invalid',
        }),
      ),
    )
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    )
    const rejected = attempts.find((item) => item.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'EMAIL_ALREADY_BOUND' },
    })
    expect(provider.messages).toHaveLength(1)
  })

  it('continues sending to later users when one user provider fails', async () => {
    const encryptionSecret = 'multi-user-encryption-fixture-value-32'
    const scheduledTime = Date.parse('2026-10-08T10:00:00.000Z')
    const fixtures = [
      {
        label: 'failure-target',
        apiKey: ['re', 'failurefixture000'].join('_'),
        profileId: '',
      },
      {
        label: 'success-target',
        apiKey: ['re', 'successfixture000'].join('_'),
        profileId: '',
      },
    ]
    for (const fixture of fixtures) {
      const email = [`${fixture.label}-recipient`, 'example.invalid'].join('@')
      const account = await ensureAccountForIdentity({
        db: env.DB,
        identity: {
          issuer: 'https://local.invalid',
          subject: fixture.label,
          email: [`${fixture.label}-login`, 'example.invalid'].join('@'),
        },
        defaultTimeZone: 'UTC',
      })
      fixture.profileId = account.profileId
      const now = new Date(scheduledTime).toISOString()
      await env.DB.prepare(
        `INSERT INTO users (
           id, profile_id, email, email_hash, timezone, email_status,
           verification_token_hash, verification_expires_at, verified_at,
           unsubscribed_at, version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'UTC', 'verified', NULL, NULL, ?, NULL, 1, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          account.profileId,
          email,
          await hashIdentityValue(email),
          now,
          now,
          now,
        )
        .run()
      await configureUserEmailProvider({
        db: env.DB,
        profileId: account.profileId,
        apiKey: fixture.apiKey,
        mailFrom: ['Study <mail', 'example.invalid>'].join('@'),
        sendHourLocal: 10,
        encryptionSecret,
      })
    }

    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const auth =
          request instanceof Request
            ? (request.headers.get('authorization') ?? '')
            : (new Headers(init?.headers).get('authorization') ?? '')
        return Promise.resolve(
          auth.includes('failurefixture')
            ? new Response('{}', { status: 400 })
            : Response.json({ id: 'message-success-fixture' }),
        )
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    await runScheduledDailyJob(scheduledTime, {
      ...env,
      RESEND_API_KEY: '<PLACEHOLDER>',
      RECIPIENT_EMAIL: '<PLACEHOLDER>',
      MAIL_FROM: '<PLACEHOLDER>',
      PUBLIC_SITE_URL: 'https://multi-user.invalid',
      USER_SECRET_ENCRYPTION_KEY: encryptionSecret,
    } as unknown as Env)

    const deliveryRows = await env.DB.prepare(
      `SELECT profile_id, status FROM email_deliveries
       WHERE profile_id IN (?, ?) ORDER BY profile_id`,
    )
      .bind(fixtures[0].profileId, fixtures[1].profileId)
      .all<{ profile_id: string; status: string }>()
    expect(deliveryRows.results).toEqual(
      expect.arrayContaining([
        { profile_id: fixtures[0].profileId, status: 'failed' },
        { profile_id: fixtures[1].profileId, status: 'sent' },
      ]),
    )
  })
})
