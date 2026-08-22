import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type {
  DailyEmailMessage,
  EmailProvider,
} from '../../worker/providers/contracts'
import { getVerifiedEmailRecipient } from '../../worker/repository/email-subscription'
import {
  confirmEmailBinding,
  requestEmailBinding,
  stopEmailSubscription,
} from '../../worker/services/email-subscription'
import { ensureAppProfile } from '../../worker/services/learning'

class CapturingEmailProvider implements EmailProvider {
  readonly name = 'test-email-provider'
  readonly messages: DailyEmailMessage[] = []

  sendDailyDigest(message: DailyEmailMessage): Promise<{ messageId: string }> {
    this.messages.push(message)
    return Promise.resolve({ messageId: `message-${this.messages.length}` })
  }
}

describe('email subscription lifecycle', () => {
  it('binds, confirms, sends idempotently, masks and unsubscribes', async () => {
    const profile = await ensureAppProfile({
      db: env.DB,
      profileId: `email-${crypto.randomUUID()}`,
      timeZone: 'Asia/Shanghai',
      now: new Date('2026-08-21T12:00:00Z'),
    })
    const email = ['learner', 'example.invalid'].join('@')
    const provider = new CapturingEmailProvider()
    const input = {
      db: env.DB,
      profileId: profile.id,
      timeZone: profile.timeZone,
      rawEmail: email,
      idempotencyKey: 'email-bind-test-0001',
      provider,
      mailFrom: ['Study <mail', 'example.invalid>'].join('@'),
      publicSiteUrl: 'https://study.example.invalid',
    }

    const pending = await requestEmailBinding(input)
    expect(pending).toMatchObject({ status: 'pending' })
    expect(pending.maskedEmail).not.toBe(email)
    await requestEmailBinding(input)
    expect(provider.messages).toHaveLength(1)

    const confirmationUrl =
      provider.messages[0].text.match(/https:\/\/[^\s]+/)?.[0]
    expect(confirmationUrl).toBeTruthy()
    const token = new URL(confirmationUrl as string).searchParams.get(
      'email_verify',
    )
    expect(token).toBeTruthy()
    const verified = await confirmEmailBinding({
      db: env.DB,
      token: token as string,
      idempotencyKey: 'email-verify-test-0001',
      timeZone: profile.timeZone,
    })
    expect(verified.status).toBe('verified')
    await expect(getVerifiedEmailRecipient(env.DB, profile.id)).resolves.toBe(
      email,
    )

    const stopped = await stopEmailSubscription({
      db: env.DB,
      profileId: profile.id,
      idempotencyKey: 'email-stop-test-0001',
      timeZone: profile.timeZone,
    })
    expect(stopped.status).toBe('unsubscribed')
    await expect(
      getVerifiedEmailRecipient(env.DB, profile.id),
    ).resolves.toBeUndefined()
  })
})
