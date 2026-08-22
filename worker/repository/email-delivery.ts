export type EmailDeliveryType = 'scheduled' | 'test'
export type EmailDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed'

export type EmailDelivery = {
  id: string
  contentDate: string
  recipientHash: string
  deliveryKey: string
  deliveryType: EmailDeliveryType
  status: EmailDeliveryStatus
  provider: string
  providerMessageId?: string
  errorCode?: string
  errorRetryable: boolean
  attemptCount: number
  leaseToken?: string
  leaseExpiresAt?: string
  firstAttemptAt?: string
  nextRetryAt?: string
  idempotencyExpiresAt?: string
  sentAt?: string
}

type EmailDeliveryRow = {
  id: string
  content_date: string
  recipient_hash: string
  delivery_key: string
  delivery_type: EmailDeliveryType
  status: EmailDeliveryStatus
  provider: string
  provider_message_id: string | null
  error_code: string | null
  error_retryable: number
  attempt_count: number
  lease_token: string | null
  lease_expires_at: string | null
  first_attempt_at: string | null
  next_retry_at: string | null
  idempotency_expires_at: string | null
  sent_at: string | null
}

export type EmailDeliveryClaim =
  | { outcome: 'claimed'; delivery: EmailDelivery; leaseToken: string }
  | { outcome: 'already_sent' | 'busy' | 'retry_exhausted' }

const maxAttempts = 3
const leaseMilliseconds = 2 * 60 * 1000
const idempotencyMilliseconds = 24 * 60 * 60 * 1000

function toDelivery(row: EmailDeliveryRow): EmailDelivery {
  return {
    id: row.id,
    contentDate: row.content_date,
    recipientHash: row.recipient_hash,
    deliveryKey: row.delivery_key,
    deliveryType: row.delivery_type,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.provider_message_id ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorRetryable: row.error_retryable === 1,
    attemptCount: row.attempt_count,
    leaseToken: row.lease_token ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    firstAttemptAt: row.first_attempt_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    idempotencyExpiresAt: row.idempotency_expires_at ?? undefined,
    sentAt: row.sent_at ?? undefined,
  }
}

export async function hashEmailRecipient(recipient: string): Promise<string> {
  const normalized = recipient.trim().normalize('NFKC').toLocaleLowerCase('en')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function buildEmailDeliveryKey(
  contentDate: string,
  recipientHash: string,
  deliveryType: EmailDeliveryType,
): string {
  const prefix =
    deliveryType === 'scheduled' ? 'daily-ielts' : 'test-daily-ielts'
  return `${prefix}/${contentDate}/${recipientHash}`
}

export async function getEmailDelivery(
  db: D1Database,
  deliveryKey: string,
): Promise<EmailDelivery | undefined> {
  const row = await db
    .prepare('SELECT * FROM email_deliveries WHERE delivery_key = ?')
    .bind(deliveryKey)
    .first<EmailDeliveryRow>()
  return row ? toDelivery(row) : undefined
}

export async function claimEmailDelivery(input: {
  db: D1Database
  contentDate: string
  recipientHash: string
  deliveryKey: string
  deliveryType: EmailDeliveryType
  provider: string
  now?: Date
}): Promise<EmailDeliveryClaim> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  await input.db
    .prepare(
      `INSERT INTO email_deliveries (
         id, content_date, recipient_hash, delivery_key, delivery_type,
         status, provider, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT(delivery_key) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      input.contentDate,
      input.recipientHash,
      input.deliveryKey,
      input.deliveryType,
      input.provider,
      nowIso,
      nowIso,
    )
    .run()

  const current = await getEmailDelivery(input.db, input.deliveryKey)
  if (!current) throw new Error('EMAIL_DELIVERY_ROW_MISSING')
  if (current.status === 'sent') return { outcome: 'already_sent' }
  if (current.attemptCount >= maxAttempts) return { outcome: 'retry_exhausted' }

  const leaseToken = crypto.randomUUID()
  const leaseExpiresAt = new Date(
    now.getTime() + leaseMilliseconds,
  ).toISOString()
  const idempotencyExpiresAt = new Date(
    now.getTime() + idempotencyMilliseconds,
  ).toISOString()
  const result = await input.db
    .prepare(
      `UPDATE email_deliveries
       SET status = 'sending',
           attempt_count = attempt_count + 1,
           lease_token = ?,
           lease_expires_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           last_attempt_at = ?,
           idempotency_expires_at = COALESCE(idempotency_expires_at, ?),
           next_retry_at = NULL,
           error_code = NULL,
           error_retryable = 0,
           updated_at = ?
       WHERE delivery_key = ?
         AND attempt_count < ?
         AND (
           status = 'pending'
           OR (
             status = 'failed'
             AND error_retryable = 1
             AND (next_retry_at IS NULL OR next_retry_at <= ?)
             AND idempotency_expires_at > ?
           )
           OR (
             status = 'sending'
             AND lease_expires_at <= ?
             AND idempotency_expires_at > ?
           )
         )`,
    )
    .bind(
      leaseToken,
      leaseExpiresAt,
      nowIso,
      nowIso,
      idempotencyExpiresAt,
      nowIso,
      input.deliveryKey,
      maxAttempts,
      nowIso,
      nowIso,
      nowIso,
      nowIso,
    )
    .run()

  if ((result.meta.changes ?? 0) === 0) {
    const latest = await getEmailDelivery(input.db, input.deliveryKey)
    if (latest?.status === 'sent') return { outcome: 'already_sent' }
    if ((latest?.attemptCount ?? 0) >= maxAttempts) {
      return { outcome: 'retry_exhausted' }
    }
    return { outcome: 'busy' }
  }

  const claimed = await getEmailDelivery(input.db, input.deliveryKey)
  if (!claimed || claimed.leaseToken !== leaseToken) {
    throw new Error('EMAIL_DELIVERY_CLAIM_LOST')
  }
  return { outcome: 'claimed', delivery: claimed, leaseToken }
}

export async function markEmailDeliverySent(input: {
  db: D1Database
  deliveryKey: string
  leaseToken: string
  messageId: string
  now?: Date
}): Promise<void> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const result = await input.db
    .prepare(
      `UPDATE email_deliveries
       SET status = 'sent', provider_message_id = ?, error_code = NULL,
           error_retryable = 0, lease_token = NULL, lease_expires_at = NULL,
           next_retry_at = NULL, sent_at = ?, updated_at = ?
       WHERE delivery_key = ? AND status = 'sending' AND lease_token = ?`,
    )
    .bind(input.messageId, nowIso, nowIso, input.deliveryKey, input.leaseToken)
    .run()
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EMAIL_DELIVERY_SENT_UPDATE_FAILED')
  }
}

export async function markEmailDeliveryFailed(input: {
  db: D1Database
  deliveryKey: string
  leaseToken: string
  errorCode: string
  retryable: boolean
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const current = await getEmailDelivery(input.db, input.deliveryKey)
  const retryDelayMinutes = current?.attemptCount === 1 ? 5 : 30
  const nextRetryAt = input.retryable
    ? new Date(now.getTime() + retryDelayMinutes * 60 * 1000).toISOString()
    : null
  const result = await input.db
    .prepare(
      `UPDATE email_deliveries
       SET status = 'failed', provider_message_id = NULL, error_code = ?,
           error_retryable = ?, lease_token = NULL, lease_expires_at = NULL,
           next_retry_at = ?, updated_at = ?
       WHERE delivery_key = ? AND status = 'sending' AND lease_token = ?`,
    )
    .bind(
      input.errorCode,
      input.retryable ? 1 : 0,
      nextRetryAt,
      nowIso,
      input.deliveryKey,
      input.leaseToken,
    )
    .run()
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EMAIL_DELIVERY_FAILED_UPDATE_FAILED')
  }
}
