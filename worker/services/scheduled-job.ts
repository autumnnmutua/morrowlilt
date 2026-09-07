import { EmailRenderError, renderDailyEmail } from '../email/render'
import { ExternalServiceError } from '../http/fetch-json'
import { getOnlineContentProvider } from '../providers/content-provider'
import type { EmailProvider } from '../providers/contracts'
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
import {
  getEmailSubscription,
  getVerifiedEmailRecipient,
} from '../repository/email-subscription'
import { listVerifiedEmailTargets } from '../repository/email-provider'
import {
  getPublicSiteUrl,
  getResendConfig,
  getResendSenderConfig,
  getUserSecretEncryptionKey,
} from '../runtime-config'
import { getBusinessDate, getBusinessHour } from '../time/business-date'
import { ContentPipelineError } from './daily-content'
import { ensureAppProfile } from './learning'
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

const scheduledCatchUpHours = 12
const hourMilliseconds = 60 * 60 * 1000

function getDueDeliveryWindow(input: {
  scheduledTime: number
  timeZone: string
  sendHourLocal: number
}): { contentDate: string; scheduledHourTime: number } | undefined {
  const businessHour = getBusinessHour(input.scheduledTime, input.timeZone)
  const hoursAfterSend = (businessHour - input.sendHourLocal + 24) % 24
  if (hoursAfterSend > scheduledCatchUpHours) return undefined
  const scheduledHourTime =
    input.scheduledTime - hoursAfterSend * hourMilliseconds
  return {
    contentDate: getBusinessDate(scheduledHourTime, input.timeZone),
    scheduledHourTime,
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

async function ensureEmailPackage(
  env: Env,
  contentDate: string,
): Promise<PersistedDailyContent> {
  const profile = await ensureAppProfile({
    db: env.DB,
    profileId: 'default',
    timeZone: env.APP_TIME_ZONE,
  })
  return ensureProfileEmailPackage({
    env,
    profileId: profile.id,
    contentDate,
    timeZone: profile.timeZone,
  })
}

async function ensureProfileEmailPackage(input: {
  env: Env
  profileId: string
  contentDate: string
  timeZone: string
}): Promise<PersistedDailyContent> {
  return ensureProfileDailyContent({
    db: input.env.DB,
    profileId: input.profileId,
    contentDate: input.contentDate,
    timeZone: input.timeZone,
    onlineProvider: getOnlineContentProvider(input.env),
  })
}

export async function runScheduledDailyJob(
  scheduledTime: number,
  env: Env,
): Promise<void> {
  const platform = getResendConfig(env)
  const storedTargets = await listVerifiedEmailTargets(env.DB)
  const targets = platform
    ? storedTargets.filter((target) => target.profileId !== 'default')
    : storedTargets
  if (platform) {
    const [subscription, account] = await Promise.all([
      getEmailSubscription(env.DB, 'default'),
      env.DB.prepare(
        "SELECT status FROM accounts WHERE profile_id = 'default'",
      ).first<{ status: string }>(),
    ])
    // A configured fallback must never override an explicit opt-out or disable.
    if (
      account?.status !== 'disabled' &&
      subscription?.status !== 'unsubscribed'
    )
      targets.push({
        profileId: 'default',
        // An unconfirmed replacement must not receive mail or suspend the
        // deployment owner's explicitly configured, pre-existing recipient.
        email:
          subscription?.status === 'verified'
            ? subscription.email
            : platform.recipientEmail,
        timeZone:
          subscription?.status === 'verified'
            ? subscription.timeZone
            : env.APP_TIME_ZONE,
      })
  }
  const encryptionSecret = getUserSecretEncryptionKey(env)
  let sent = 0
  let alreadySent = 0
  let skipped = 0
  let failed = 0

  for (const target of targets) {
    const isPlatformRecipient =
      platform !== undefined && target.profileId === 'default'
    const sendHourLocal = isPlatformRecipient
      ? platform.sendHourLocal
      : target.sendHourLocal
    if (sendHourLocal === undefined) {
      skipped += 1
      continue
    }
    const due = getDueDeliveryWindow({
      scheduledTime,
      timeZone: target.timeZone,
      sendHourLocal,
    })
    if (!due) {
      skipped += 1
      continue
    }
    const { contentDate } = due
    if (
      !isPlatformRecipient &&
      target.deliveryReadyAt &&
      Date.parse(target.deliveryReadyAt) > due.scheduledHourTime
    ) {
      skipped += 1
      continue
    }
    try {
      const content = await ensureProfileEmailPackage({
        env,
        profileId: target.profileId,
        contentDate,
        timeZone: target.timeZone,
      })
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
      if (result.outcome === 'sent') {
        sent += 1
      } else if (result.outcome === 'already_sent') {
        alreadySent += 1
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
              : error instanceof ContentPipelineError
                ? error.code
                : 'EMAIL_TARGET_FAILED',
          contentDate,
        }),
      )
    }
  }

  // Prepare content at the beginning of each learner's business day and once
  // more during the hour before delivery. This keeps website reads fast and
  // gives transient AI failures several independent Cron opportunities without
  // delaying or replacing the previous day's catch-up email.
  for (const target of targets) {
    const isPlatformRecipient =
      platform !== undefined && target.profileId === 'default'
    const sendHourLocal = isPlatformRecipient
      ? platform.sendHourLocal
      : target.sendHourLocal
    if (sendHourLocal === undefined) continue
    const businessHour = getBusinessHour(scheduledTime, target.timeZone)
    const warmupHour = (sendHourLocal + 23) % 24
    if (businessHour !== 0 && businessHour !== warmupHour) continue
    const contentDate = getBusinessDate(scheduledTime, target.timeZone)
    try {
      await ensureProfileEmailPackage({
        env,
        profileId: target.profileId,
        contentDate,
        timeZone: target.timeZone,
      })
      console.log(
        JSON.stringify({
          event: 'daily_email_content_ready',
          contentDate,
        }),
      )
    } catch (error) {
      failed += 1
      console.error(
        JSON.stringify({
          event: 'daily_email_content_warmup_failed',
          code:
            error instanceof ContentPipelineError
              ? error.code
              : 'EMAIL_CONTENT_WARMUP_FAILED',
          contentDate,
        }),
      )
    }
  }
  console.log(
    JSON.stringify({
      event: 'daily_email_completed',
      sent,
      alreadySent,
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
