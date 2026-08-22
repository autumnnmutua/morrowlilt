import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderDailyEmail } from '../../worker/email/render'
import type {
  DailyEmailMessage,
  EmailProvider,
} from '../../worker/providers/contracts'
import { ResendEmailProvider } from '../../worker/providers/resend'
import {
  buildEmailDeliveryKey,
  getEmailDelivery,
  hashEmailRecipient,
} from '../../worker/repository/email-delivery'
import { ensureDailyContent } from '../../worker/services/daily-content'
import {
  deliverDailyEmail,
  runScheduledDailyJob,
} from '../../worker/services/scheduled-job'

const recipient = ['learner', 'example.invalid'].join('@')
const mailFrom = ['MorrowLilt <learn', 'example.invalid>'].join('@')
const publicSiteUrl = 'https://study.example.invalid'

class RecordingEmailProvider implements EmailProvider {
  readonly name = 'mock-email'
  readonly messages: DailyEmailMessage[] = []
  error?: Error

  sendDailyDigest(message: DailyEmailMessage): Promise<{ messageId: string }> {
    this.messages.push(message)
    if (this.error) return Promise.reject(this.error)
    return Promise.resolve({ messageId: `message-${this.messages.length}` })
  }
}

async function content(contentDate: string) {
  return ensureDailyContent({
    db: env.DB,
    contentDate,
    timeZone: 'Asia/Shanghai',
  })
}

async function deliveryKey(contentDate: string, type: 'scheduled' | 'test') {
  return buildEmailDeliveryKey(
    contentDate,
    await hashEmailRecipient(recipient),
    type,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('daily email rendering', () => {
  it('escapes HTML and keeps every learning section readable in plain text', async () => {
    const daily = structuredClone(await content('2026-11-01'))
    daily.payload.sentence.english =
      '<script>alert("x")</script> Study steadily.'
    daily.payload.sentence.chinese = '每天稳步学习。'
    const rendered = renderDailyEmail(daily, publicSiteUrl)

    expect(rendered.html).not.toContain('<script>alert')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).toContain('今日地道表达')
    expect(rendered.html).toContain('返回网站继续学习')
    expect(rendered.text).toContain('今日句子\n')
    expect(rendered.text).toContain('\n中文释义\n')
    expect(rendered.text).toContain('\n用法注意\n')
    expect(rendered.text).toContain('\n常用搭配\n')
    expect(rendered.text).not.toContain('今日 IELTS 话题')
    expect(rendered.text).not.toContain('口语练习')
    expect(rendered.text).toContain('\n微练习\n')
    expect(rendered.text).toContain(`返回网站：${publicSiteUrl}/`)
  })

  it('rejects incomplete content instead of sending a partial message', async () => {
    const daily = structuredClone(await content('2026-11-02'))
    daily.payload.sentence.collocations = []
    const provider = new RecordingEmailProvider()
    await expect(
      deliverDailyEmail({
        db: env.DB,
        content: daily,
        provider,
        recipient,
        mailFrom,
        publicSiteUrl,
        deliveryType: 'scheduled',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_CONTENT_INCOMPLETE' })
    expect(provider.messages).toHaveLength(0)
    await expect(
      getEmailDelivery(env.DB, await deliveryKey('2026-11-02', 'scheduled')),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'EMAIL_CONTENT_INCOMPLETE',
      errorRetryable: false,
    })
  })
})

describe('email delivery state machine', () => {
  it('sends only once when the same business date is triggered repeatedly', async () => {
    const daily = await content('2026-11-03')
    const provider = new RecordingEmailProvider()
    const input = {
      db: env.DB,
      content: daily,
      provider,
      recipient,
      mailFrom,
      publicSiteUrl,
      deliveryType: 'scheduled' as const,
    }
    await expect(deliverDailyEmail(input)).resolves.toEqual({ outcome: 'sent' })
    await expect(deliverDailyEmail(input)).resolves.toEqual({
      outcome: 'already_sent',
    })
    expect(provider.messages).toHaveLength(1)
    expect(provider.messages[0].idempotencyKey).toBe(
      await deliveryKey('2026-11-03', 'scheduled'),
    )
  })

  it('allows only one concurrent sender to claim a delivery', async () => {
    const daily = await content('2026-11-04')
    const provider = new RecordingEmailProvider()
    const input = {
      db: env.DB,
      content: daily,
      provider,
      recipient,
      mailFrom,
      publicSiteUrl,
      deliveryType: 'scheduled' as const,
    }
    const outcomes = await Promise.all([
      deliverDailyEmail(input),
      deliverDailyEmail(input),
      deliverDailyEmail(input),
    ])
    expect(provider.messages).toHaveLength(1)
    expect(outcomes.filter((item) => item.outcome === 'sent')).toHaveLength(1)
    expect(
      outcomes.every((item) =>
        ['sent', 'busy', 'already_sent'].includes(item.outcome),
      ),
    ).toBe(true)
  })

  it('reuses the same provider key after a post-send database failure', async () => {
    const daily = await content('2026-11-05')
    const provider = new RecordingEmailProvider()
    const now = new Date('2026-11-05T00:00:00.000Z')
    const key = await deliveryKey('2026-11-05', 'scheduled')
    await expect(
      deliverDailyEmail({
        db: env.DB,
        content: daily,
        provider,
        recipient,
        mailFrom,
        publicSiteUrl,
        deliveryType: 'scheduled',
        now,
        dependencies: {
          markSent: () => Promise.reject(new Error('simulated D1 failure')),
        },
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DATABASE_UPDATE_FAILED' })

    await env.DB.prepare(
      `UPDATE email_deliveries SET lease_expires_at = ? WHERE delivery_key = ?`,
    )
      .bind('2026-11-05T00:01:00.000Z', key)
      .run()
    await expect(
      deliverDailyEmail({
        db: env.DB,
        content: daily,
        provider,
        recipient,
        mailFrom,
        publicSiteUrl,
        deliveryType: 'scheduled',
        now: new Date('2026-11-05T00:03:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'sent' })

    expect(provider.messages).toHaveLength(2)
    expect(
      new Set(provider.messages.map((item) => item.idempotencyKey)),
    ).toEqual(new Set([key]))
    await expect(getEmailDelivery(env.DB, key)).resolves.toMatchObject({
      status: 'sent',
      attemptCount: 2,
    })
  })
})

describe('Resend error policy', () => {
  it.each([
    [400, 1, false],
    [429, 2, true],
    [503, 2, true],
  ])(
    'handles HTTP %i with bounded attempts',
    async (status, expectedCalls, retryable) => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(new Response('{}', { status })),
      )
      vi.stubGlobal('fetch', fetchMock)
      const provider = new ResendEmailProvider('test-fixture', {
        maxAttempts: 2,
        timeoutMs: 100,
      })
      await expect(
        provider.sendDailyDigest({
          contentDate: '2026-11-06',
          from: mailFrom,
          to: recipient,
          subject: 'test',
          html: '<p>test</p>',
          text: 'test',
          idempotencyKey: 'daily-ielts/test/error-policy',
        }),
      ).rejects.toMatchObject({
        code: 'EXTERNAL_HTTP_ERROR',
        retryable,
        status,
      })
      expect(fetchMock).toHaveBeenCalledTimes(expectedCalls)
    },
  )

  it('bounds a provider timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const provider = new ResendEmailProvider('test-fixture', {
      maxAttempts: 1,
      timeoutMs: 5,
    })
    await expect(
      provider.sendDailyDigest({
        contentDate: '2026-11-07',
        from: mailFrom,
        to: recipient,
        subject: 'test',
        html: '<p>test</p>',
        text: 'test',
        idempotencyKey: 'daily-ielts/test/timeout-policy',
      }),
    ).rejects.toMatchObject({
      code: 'EXTERNAL_TIMEOUT',
      retryable: true,
    })
  })
})

describe('scheduled and administrator email entry points', () => {
  it('deduplicates repeated scheduled triggers for the same local date', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({ id: 'provider-message-fixture' }, { status: 200 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const scheduledTime = Date.parse('2026-11-09T00:00:00.000Z')
    await runScheduledDailyJob(scheduledTime, env)
    await runScheduledDailyJob(scheduledTime, env)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('requires authorization for preview and defaults explicit tests to the Resend test target', async () => {
    const date = '2026-11-10'
    const unauthorized = await exports.default.fetch(
      new Request('https://study.example.invalid/api/admin/email/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date }),
      }),
    )
    expect(unauthorized.status).toBe(401)

    const authorization = {
      authorization: `Bearer ${['local', 'admin', 'fixture'].join('-')}`,
    }
    const preview = await exports.default.fetch(
      new Request('https://study.example.invalid/api/admin/email/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authorization },
        body: JSON.stringify({ date }),
      }),
    )
    expect(preview.status).toBe(200)
    const previewBody = JSON.stringify(await preview.json())
    expect(previewBody).toContain('常用搭配')
    expect(previewBody).not.toContain(authorization.authorization)

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ id: 'test-message-fixture' }, { status: 200 }),
        ),
      ),
    )
    const sent = await exports.default.fetch(
      new Request('https://study.example.invalid/api/admin/email/test-send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'explicit-test-send-20261110',
          ...authorization,
        },
        body: JSON.stringify({ date }),
      }),
    )
    expect(sent.status).toBe(200)
    await expect(sent.json()).resolves.toMatchObject({
      data: { contentDate: date, target: 'resend_test', outcome: 'sent' },
    })
  })
})
