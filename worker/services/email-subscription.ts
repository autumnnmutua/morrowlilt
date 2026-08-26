import { escapeHtml } from '../email/render'
import type { EmailProvider } from '../providers/contracts'
import {
  getEmailSubscription,
  getEmailSubscriptionByHash,
  savePendingEmailSubscription,
  unsubscribeEmail,
  verifyPendingEmailSubscription,
  type EmailSubscription,
  type EmailSubscriptionStatus,
} from '../repository/email-subscription'
import {
  getEmailProviderCredential,
  saveEmailProviderCredential,
} from '../repository/email-provider'
import { decryptSecret, encryptSecret } from '../security/secret-envelope'

export class EmailSubscriptionError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'EmailSubscriptionError'
    this.code = code
    this.status = status
  }
}

export function normalizeEmail(value: string): string {
  const normalized = value.trim().normalize('NFKC').toLowerCase()
  if (
    normalized.length > 254 ||
    normalized.length < 3 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      normalized,
    )
  ) {
    throw new EmailSubscriptionError(
      'EMAIL_INVALID',
      '请输入有效且长度合理的邮箱地址',
      400,
    )
  }
  return normalized
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

export type PublicEmailSettings = {
  status: EmailSubscriptionStatus
  maskedEmail?: string
  timeZone: string
  deliveryMode?: 'platform' | 'bring_your_own'
  providerConfigured?: boolean
  sendHourLocal?: number
}

function toPublic(
  subscription: EmailSubscription | undefined,
  fallbackTimeZone: string,
): PublicEmailSettings {
  return subscription
    ? {
        status: subscription.status,
        maskedEmail: maskEmail(subscription.email),
        timeZone: subscription.timeZone,
      }
    : { status: 'not_configured', timeZone: fallbackTimeZone }
}

export async function readEmailSettings(input: {
  db: D1Database
  profileId: string
  timeZone: string
}): Promise<PublicEmailSettings> {
  return toPublic(
    await getEmailSubscription(input.db, input.profileId),
    input.timeZone,
  )
}

export async function readEmailSettingsWithProvider(input: {
  db: D1Database
  profileId: string
  timeZone: string
  platformDelivery: boolean
  platformSendHour: number
}): Promise<PublicEmailSettings> {
  const [settings, credential] = await Promise.all([
    readEmailSettings(input),
    getEmailProviderCredential(input.db, input.profileId),
  ])
  return {
    ...settings,
    deliveryMode: input.platformDelivery ? 'platform' : 'bring_your_own',
    providerConfigured: input.platformDelivery || credential !== undefined,
    sendHourLocal: input.platformDelivery
      ? input.platformSendHour
      : credential?.sendHourLocal,
  }
}

export async function configureUserEmailProvider(input: {
  db: D1Database
  profileId: string
  apiKey: string
  mailFrom: string
  sendHourLocal: number
  encryptionSecret: string
}): Promise<{ providerConfigured: true; sendHourLocal: number }> {
  const apiKey = input.apiKey.trim()
  const mailFrom = input.mailFrom.trim()
  if (!/^re_[A-Za-z0-9_-]{12,200}$/.test(apiKey)) {
    throw new EmailSubscriptionError(
      'EMAIL_PROVIDER_API_KEY_INVALID',
      '请输入有效的 Resend API Key',
      400,
    )
  }
  if (!/^.+<\S+@\S+\.\S+>$|^\S+@\S+\.\S+$/.test(mailFrom)) {
    throw new EmailSubscriptionError(
      'EMAIL_PROVIDER_SENDER_INVALID',
      '请输入使用已验证发送域名的发件地址',
      400,
    )
  }
  if (
    !Number.isInteger(input.sendHourLocal) ||
    input.sendHourLocal < 0 ||
    input.sendHourLocal > 23
  ) {
    throw new EmailSubscriptionError(
      'EMAIL_PROVIDER_SEND_HOUR_INVALID',
      '发送小时必须在 0 至 23 之间',
      400,
    )
  }
  const context = `email-provider:${input.profileId}:resend`
  const encrypted = await encryptSecret({
    encryptionSecret: input.encryptionSecret,
    plaintext: apiKey,
    context,
  })
  await saveEmailProviderCredential({
    db: input.db,
    profileId: input.profileId,
    encryptedApiKey: encrypted.ciphertext,
    encryptionIv: encrypted.iv,
    mailFrom,
    sendHourLocal: input.sendHourLocal,
  })
  return { providerConfigured: true, sendHourLocal: input.sendHourLocal }
}

export async function readUserEmailProvider(input: {
  db: D1Database
  profileId: string
  encryptionSecret: string
}): Promise<
  { apiKey: string; mailFrom: string; sendHourLocal: number } | undefined
> {
  const credential = await getEmailProviderCredential(input.db, input.profileId)
  if (!credential) return undefined
  return {
    apiKey: await decryptSecret({
      encryptionSecret: input.encryptionSecret,
      ciphertext: credential.encryptedApiKey,
      iv: credential.encryptionIv,
      context: `email-provider:${input.profileId}:resend`,
    }),
    mailFrom: credential.mailFrom,
    sendHourLocal: credential.sendHourLocal,
  }
}

function verificationMessage(input: { publicSiteUrl: string; token: string }): {
  html: string
  text: string
} {
  const url = new URL(input.publicSiteUrl)
  url.searchParams.set('email_verify', input.token)
  url.searchParams.set('view', 'settings')
  const safeUrl = escapeHtml(url.toString())
  return {
    text: `请确认接收每日学习邮件：${url.toString()}\n\n如果不是你发起的操作，可以忽略此邮件。`,
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background-color:#f7f4ec;font-family:Arial,'Microsoft YaHei',sans-serif;color:#18322f"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding-top:28px;padding-right:12px;padding-bottom:28px;padding-left:12px"><table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#fffdf8;border:1px solid #d8e2dd"><tr><td style="padding-top:28px;padding-right:28px;padding-bottom:28px;padding-left:28px"><h1 style="font-size:24px;line-height:1.4;color:#18322f">确认每日学习邮件</h1><p style="font-size:16px;line-height:1.7;color:#304946">点击下面的按钮确认邮箱。确认后，系统会按你在设置页选择的时区和时间发送与网站当天内容一致的学习包。</p><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#2d7568" style="background-color:#2d7568"><a href="${safeUrl}" style="display:inline-block;padding-top:12px;padding-right:20px;padding-bottom:12px;padding-left:20px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.4">确认邮箱</a></td></tr></table><p style="font-size:13px;line-height:1.6;color:#526966">如果不是你发起的操作，可以忽略此邮件。</p></td></tr></table></td></tr></table></body></html>`,
  }
}

export async function requestEmailBinding(input: {
  db: D1Database
  profileId: string
  timeZone: string
  rawEmail: string
  idempotencyKey: string
  provider: EmailProvider
  mailFrom: string
  publicSiteUrl: string
}): Promise<PublicEmailSettings> {
  const email = normalizeEmail(input.rawEmail)
  const [emailHash, token] = await Promise.all([
    sha256(email),
    Promise.resolve(createToken()),
  ])
  const tokenHash = await sha256(token)
  const conflicting = await getEmailSubscriptionByHash(input.db, emailHash)
  if (conflicting && conflicting.profileId !== input.profileId) {
    throw new EmailSubscriptionError(
      'EMAIL_ALREADY_BOUND',
      '该邮箱已经绑定到另一个账号',
      409,
    )
  }
  let saved
  try {
    saved = await savePendingEmailSubscription({
      db: input.db,
      profileId: input.profileId,
      email,
      emailHash,
      timeZone: input.timeZone,
      verificationTokenHash: tokenHash,
      verificationExpiresAt: new Date(
        Date.now() + 30 * 60 * 1000,
      ).toISOString(),
      idempotencyKey: input.idempotencyKey,
    })
  } catch (error) {
    const winner = await getEmailSubscriptionByHash(input.db, emailHash)
    if (winner && winner.profileId !== input.profileId) {
      throw new EmailSubscriptionError(
        'EMAIL_ALREADY_BOUND',
        '该邮箱已经绑定到另一个账号',
        409,
      )
    }
    throw error
  }
  if (saved.createdEvent) {
    const message = verificationMessage({
      publicSiteUrl: input.publicSiteUrl,
      token,
    })
    await input.provider.sendDailyDigest({
      contentDate: new Date().toISOString().slice(0, 10),
      from: input.mailFrom,
      to: email,
      subject: '确认每日学习邮件',
      html: message.html,
      text: message.text,
      idempotencyKey: `email-binding/${saved.subscription.id}/${saved.subscription.version}`,
    })
  }
  return toPublic(saved.subscription, input.timeZone)
}

export async function confirmEmailBinding(input: {
  db: D1Database
  profileId: string
  token: string
  idempotencyKey: string
  timeZone: string
}): Promise<PublicEmailSettings> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(input.token)) {
    throw new EmailSubscriptionError(
      'EMAIL_VERIFICATION_INVALID',
      '确认链接无效或已过期',
      400,
    )
  }
  const subscription = await verifyPendingEmailSubscription(
    input.db,
    input.profileId,
    await sha256(input.token),
    input.idempotencyKey,
  )
  if (!subscription) {
    throw new EmailSubscriptionError(
      'EMAIL_VERIFICATION_INVALID',
      '确认链接无效或已过期',
      400,
    )
  }
  return toPublic(subscription, input.timeZone)
}

export async function stopEmailSubscription(input: {
  db: D1Database
  profileId: string
  idempotencyKey: string
  timeZone: string
}): Promise<PublicEmailSettings> {
  return toPublic(
    await unsubscribeEmail(input.db, input.profileId, input.idempotencyKey),
    input.timeZone,
  )
}
