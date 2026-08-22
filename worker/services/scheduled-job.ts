import { EmailRenderError, renderDailyEmail } from '../email/render'
import { ExternalServiceError } from '../http/fetch-json'
import { HttpContentProvider } from '../providers/http-content'
import type { ContentProvider, EmailProvider } from '../providers/contracts'
import { ResendEmailProvider } from '../providers/resend'
import {
  buildEmailDeliveryKey,
  claimEmailDelivery,
  hashEmailRecipient,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  type EmailDeliveryType,
} from '../repository/email-delivery'
import type { PersistedDailyContent } from '../repository/daily-content'
import { getVerifiedEmailRecipient } from '../repository/email-subscription'
import { listVerifiedEmailTargets } from '../repository/email-provider'
import {
  getContentProviderConfig,
  getPublicSiteUrl,
  getResendConfig,
  getResendSenderConfig,
  getUserSecretEncryptionKey,
  getWorkersAiBinding,
  isWorkersAiContentEnabled,
} from '../runtime-config'
import { getBusinessDate, getBusinessHour } from '../time/business-date'
import { ensureDailyContent } from './daily-content'
import { ensureDailyLearningPackage } from './daily-package'
import { ensureProfileDailyLearningPackage } from './daily-package'
import { ensureAppProfile } from './learning'
import { WorkersAiContentProvider } from '../providers/workers-ai'
import { decryptSecret } from '../security/secret-envelope'
import { ensureProfileDailyContent } from './profile-daily-content'

export class EmailDeliveryError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(code: string, retryable: boolean, status = 502) {
    super('Email delivery could not be completed')
    this.name = 'EmailDeliveryError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

type DeliveryDependencies = {
  markSent?: typeof markEmailDeliverySent
  markFailed?: typeof markEmailDeliveryFailed
}

function classifyEmailError(error: unknown): EmailDeliveryError {
  if (error instanceof EmailDeliveryError) return error
  if (error instanceof EmailRenderError) {
    return new EmailDeliveryError(error.code, false, 422)
  }
  if (error instanceof ExternalServiceError) {
    if (error.status === 429) {
      return new EmailDeliveryError('EMAIL_PROVIDER_RATE_LIMIT', true)
    }
    if (error.status && error.status >= 500) {
      return new EmailDeliveryError('EMAIL_PROVIDER_SERVER_ERROR', true)
    }
    if (error.status && error.status >= 400) {
      return new EmailDeliveryError('EMAIL_PROVIDER_REQUEST_REJECTED', false)
    }
    if (error.code === 'EXTERNAL_TIMEOUT') {
      return new EmailDeliveryError('EMAIL_PROVIDER_TIMEOUT', true)
    }
    if (error.retryable) {
      return new EmailDeliveryError('EMAIL_PROVIDER_UNAVAILABLE', true)
    }
    return new EmailDeliveryError('EMAIL_PROVIDER_INVALID_RESPONSE', false)
  }
  return new EmailDeliveryError('EMAIL_UNEXPECTED_ERROR', false, 500)
}

export async function deliverDailyEmail(input: {
  db: D1Database
  profileId?: string
  content: PersistedDailyContent
  provider: EmailProvider
  recipient: string
  mailFrom: string
  publicSiteUrl: string
  deliveryType: EmailDeliveryType
  now?: Date
  dependencies?: DeliveryDependencies
}): Promise<{ outcome: 'sent' | 'already_sent' | 'busy' | 'retry_exhausted' }> {
  const recipientHash = await hashEmailRecipient(input.recipient)
  const deliveryKey = buildEmailDeliveryKey(
    input.content.contentDate,
    recipientHash,
    input.deliveryType,
  )
  const claim = await claimEmailDelivery({
    db: input.db,
    profileId: input.profileId ?? 'default',
    contentDate: input.content.contentDate,
    recipientHash,
    deliveryKey,
    deliveryType: input.deliveryType,
    provider: input.provider.name,
    now: input.now,
  })
  if (claim.outcome !== 'claimed') return { outcome: claim.outcome }

  try {
    const rendered = renderDailyEmail(input.content, input.publicSiteUrl)
    const result = await input.provider.sendDailyDigest({
      contentDate: input.content.contentDate,
      from: input.mailFrom,
      to: input.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: deliveryKey,
    })
    try {
      await (input.dependencies?.markSent ?? markEmailDeliverySent)({
        db: input.db,
        deliveryKey,
        leaseToken: claim.leaseToken,
        messageId: result.messageId,
        now: input.now,
      })
    } catch {
      throw new EmailDeliveryError('EMAIL_DATABASE_UPDATE_FAILED', true, 500)
    }
    return { outcome: 'sent' }
  } catch (error) {
    const classified = classifyEmailError(error)
    if (classified.code === 'EMAIL_DATABASE_UPDATE_FAILED') throw classified
    try {
      await (input.dependencies?.markFailed ?? markEmailDeliveryFailed)({
        db: input.db,
        deliveryKey,
        leaseToken: claim.leaseToken,
        errorCode: classified.code,
        retryable: classified.retryable,
        now: input.now,
      })
    } catch {
      throw new EmailDeliveryError('EMAIL_DATABASE_UPDATE_FAILED', true, 500)
    }
    throw classified
  }
}

function getOnlineProvider(env: Env): ContentProvider | undefined {
  const config = getContentProviderConfig(env)
  if (config) return new HttpContentProvider(config.endpoint, config.apiKey)
  const ai = getWorkersAiBinding(env)
  return isWorkersAiContentEnabled(env) && ai
    ? new WorkersAiContentProvider(ai)
    : undefined
}

export async function ensureEmailContent(
  env: Env,
  contentDate: string,
): Promise<PersistedDailyContent> {
  return ensureDailyContent({
    db: env.DB,
    contentDate,
    timeZone: env.APP_TIME_ZONE,
    onlineProvider: getOnlineProvider(env),
  })
}

async function ensureEmailPackage(
  env: Env,
  contentDate: string,
): Promise<PersistedDailyContent> {
  await ensureAppProfile({
    db: env.DB,
    profileId: 'default',
    timeZone: env.APP_TIME_ZONE,
  })
  const content = await ensureEmailContent(env, contentDate)
  await ensureDailyLearningPackage({ db: env.DB, content })
  return content
}

async function ensureProfileEmailPackage(input: {
  env: Env
  profileId: string
  contentDate: string
  timeZone: string
}): Promise<PersistedDailyContent> {
  await ensureAppProfile({
    db: input.env.DB,
    profileId: input.profileId,
    timeZone: input.timeZone,
  })
  const content = await ensureProfileDailyContent({
    db: input.env.DB,
    profileId: input.profileId,
    contentDate: input.contentDate,
    timeZone: input.timeZone,
    onlineProvider: getOnlineProvider(input.env),
  })
  await ensureProfileDailyLearningPackage({
    db: input.env.DB,
    profileId: input.profileId,
    content,
  })
  return content
}

export async function runScheduledDailyJob(
  scheduledTime: number,
  env: Env,
): Promise<void> {
  const platform = getResendConfig(env)
  const targets = await listVerifiedEmailTargets(env.DB)
  if (
    platform &&
    !targets.some(
      (target) =>
        target.email.trim().toLowerCase() ===
        platform.recipientEmail.trim().toLowerCase(),
    )
  ) {
    targets.push({
      profileId: 'default',
      email: platform.recipientEmail,
      timeZone: env.APP_TIME_ZONE,
    })
  }
  const encryptionSecret = getUserSecretEncryptionKey(env)
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const target of targets) {
    const isPlatformRecipient =
      platform !== undefined &&
      target.email.trim().toLowerCase() ===
        platform.recipientEmail.trim().toLowerCase()
    const sendHourLocal = isPlatformRecipient
      ? platform.sendHourLocal
      : target.sendHourLocal
    const businessHour = getBusinessHour(scheduledTime, target.timeZone)
    if (sendHourLocal === undefined || businessHour !== sendHourLocal) {
      skipped += 1
      continue
    }
    const contentDate = getBusinessDate(scheduledTime, target.timeZone)
    try {
      let apiKey: string
      let mailFrom: string
      let publicSiteUrl: string
      if (isPlatformRecipient) {
        apiKey = platform.apiKey
        mailFrom = platform.mailFrom
        publicSiteUrl = platform.publicSiteUrl
      } else {
        if (
          !encryptionSecret ||
          !target.encryptedApiKey ||
          !target.encryptionIv ||
          !target.mailFrom
        ) {
          skipped += 1
          continue
        }
        apiKey = await decryptSecret({
          encryptionSecret,
          ciphertext: target.encryptedApiKey,
          iv: target.encryptionIv,
          context: `email-provider:${target.profileId}:resend`,
        })
        mailFrom = target.mailFrom
        publicSiteUrl = getPublicSiteUrl(env) ?? ''
        if (!publicSiteUrl) {
          skipped += 1
          continue
        }
      }
      const content = await ensureProfileEmailPackage({
        env,
        profileId: target.profileId,
        contentDate,
        timeZone: target.timeZone,
      })
      const result = await deliverDailyEmail({
        db: env.DB,
        profileId: target.profileId,
        content,
        provider: new ResendEmailProvider(apiKey),
        recipient: target.email,
        mailFrom,
        publicSiteUrl,
        deliveryType: 'scheduled',
      })
      if (result.outcome === 'sent' || result.outcome === 'already_sent') {
        sent += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      failed += 1
      console.error(
        JSON.stringify({
          event: 'daily_email_target_failed',
          code:
            error instanceof EmailDeliveryError
              ? error.code
              : 'EMAIL_TARGET_FAILED',
          contentDate,
        }),
      )
    }
  }
  console.log(
    JSON.stringify({
      event: 'daily_email_completed',
      sent,
      skipped,
      failed,
    }),
  )
}

export async function previewDailyEmail(input: {
  env: Env
  contentDate: string
  publicSiteUrl: string
}): Promise<{ subject: string; html: string; text: string }> {
  const content = await ensureEmailPackage(input.env, input.contentDate)
  return renderDailyEmail(content, input.publicSiteUrl)
}

export async function sendTestDailyEmail(input: {
  env: Env
  contentDate: string
  useConfiguredRecipient: boolean
}): Promise<{ outcome: 'sent' | 'already_sent' | 'busy' | 'retry_exhausted' }> {
  const senderConfig = getResendSenderConfig(input.env)
  if (!senderConfig) {
    throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED', false, 503)
  }
  const testRecipient = ['delivered', 'resend.dev'].join('@')
  const configuredRecipient =
    (await getVerifiedEmailRecipient(input.env.DB, 'default')) ??
    getResendConfig(input.env)?.recipientEmail
  if (input.useConfiguredRecipient && !configuredRecipient) {
    throw new EmailDeliveryError('EMAIL_RECIPIENT_NOT_VERIFIED', false, 409)
  }
  const recipient = input.useConfiguredRecipient
    ? (configuredRecipient as string)
    : testRecipient
  const content = await ensureEmailPackage(input.env, input.contentDate)
  return deliverDailyEmail({
    db: input.env.DB,
    profileId: 'default',
    content,
    provider: new ResendEmailProvider(senderConfig.apiKey),
    recipient,
    mailFrom: senderConfig.mailFrom,
    publicSiteUrl: senderConfig.publicSiteUrl,
    deliveryType: 'test',
  })
}

export async function sendProfileTestDailyEmail(input: {
  env: Env
  profileId: string
  timeZone: string
  recipient: string
  apiKey: string
  mailFrom: string
  publicSiteUrl: string
}): Promise<{ outcome: 'sent' | 'already_sent' | 'busy' | 'retry_exhausted' }> {
  const contentDate = getBusinessDate(Date.now(), input.timeZone)
  const content = await ensureProfileEmailPackage({
    env: input.env,
    profileId: input.profileId,
    contentDate,
    timeZone: input.timeZone,
  })
  return deliverDailyEmail({
    db: input.env.DB,
    profileId: input.profileId,
    content,
    provider: new ResendEmailProvider(input.apiKey),
    recipient: input.recipient,
    mailFrom: input.mailFrom,
    publicSiteUrl: input.publicSiteUrl,
    deliveryType: 'test',
  })
}
