export type EmailSubscriptionStatus =
  'not_configured' | 'pending' | 'verified' | 'unsubscribed'

export type EmailSubscription = {
  id: string
  profileId: string
  email: string
  emailHash: string
  timeZone: string
  status: Exclude<EmailSubscriptionStatus, 'not_configured'>
  version: number
  verificationExpiresAt?: string
}

type UserRow = {
  id: string
  profile_id: string
  email: string
  email_hash: string
  timezone: string
  email_status: EmailSubscription['status']
  version: number
  verification_expires_at: string | null
}

function mapUser(row: UserRow): EmailSubscription {
  return {
    id: row.id,
    profileId: row.profile_id,
    email: row.email,
    emailHash: row.email_hash,
    timeZone: row.timezone,
    status: row.email_status,
    version: row.version,
    verificationExpiresAt: row.verification_expires_at ?? undefined,
  }
}

const columns = `id, profile_id, email, email_hash, timezone, email_status,
  version, verification_expires_at`

export async function getEmailSubscription(
  db: D1Database,
  profileId: string,
): Promise<EmailSubscription | undefined> {
  const row = await db
    .prepare(`SELECT ${columns} FROM users WHERE profile_id = ? LIMIT 1`)
    .bind(profileId)
    .first<UserRow>()
  return row ? mapUser(row) : undefined
}

export async function getEmailSubscriptionByHash(
  db: D1Database,
  emailHash: string,
): Promise<EmailSubscription | undefined> {
  const row = await db
    .prepare(`SELECT ${columns} FROM users WHERE email_hash = ? LIMIT 1`)
    .bind(emailHash)
    .first<UserRow>()
  return row ? mapUser(row) : undefined
}

export async function hasSubscriptionEvent(
  db: D1Database,
  userId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM email_subscription_events
       WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(userId, idempotencyKey)
    .first<{ found: number }>()
  return row?.found === 1
}

export async function savePendingEmailSubscription(input: {
  db: D1Database
  profileId: string
  email: string
  emailHash: string
  timeZone: string
  verificationTokenHash: string
  verificationExpiresAt: string
  idempotencyKey: string
}): Promise<{ subscription: EmailSubscription; createdEvent: boolean }> {
  const existing = await getEmailSubscription(input.db, input.profileId)
  if (
    existing &&
    (await hasSubscriptionEvent(input.db, existing.id, input.idempotencyKey))
  ) {
    return { subscription: existing, createdEvent: false }
  }
  const userId = existing?.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  await input.db.batch([
    input.db
      .prepare(
        `INSERT INTO users (
           id, profile_id, email, email_hash, timezone, email_status,
           verification_token_hash, verification_expires_at, verified_at,
           unsubscribed_at, version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, 1, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET
           email = excluded.email,
           email_hash = excluded.email_hash,
           timezone = excluded.timezone,
           email_status = 'pending',
           verification_token_hash = excluded.verification_token_hash,
           verification_expires_at = excluded.verification_expires_at,
           verified_at = NULL,
           unsubscribed_at = NULL,
           version = users.version + 1,
           updated_at = excluded.updated_at`,
      )
      .bind(
        userId,
        input.profileId,
        input.email,
        input.emailHash,
        input.timeZone,
        input.verificationTokenHash,
        input.verificationExpiresAt,
        now,
        now,
      ),
    input.db
      .prepare(
        `INSERT INTO email_subscription_events (
           id, user_id, event_type, idempotency_key, created_at
         ) VALUES (?, ?, 'bind_requested', ?, ?)
         ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), userId, input.idempotencyKey, now),
  ])
  const subscription = await getEmailSubscription(input.db, input.profileId)
  if (!subscription) throw new Error('EMAIL_SUBSCRIPTION_SAVE_FAILED')
  return { subscription, createdEvent: true }
}

export async function verifyPendingEmailSubscription(
  db: D1Database,
  verificationTokenHash: string,
  idempotencyKey: string,
): Promise<EmailSubscription | undefined> {
  const row = await db
    .prepare(
      `SELECT ${columns} FROM users
       WHERE verification_token_hash = ?
         AND email_status = 'pending'
         AND verification_expires_at > ?
       LIMIT 1`,
    )
    .bind(verificationTokenHash, new Date().toISOString())
    .first<UserRow>()
  if (!row) return undefined
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE users SET email_status = 'verified',
           verification_token_hash = NULL, verification_expires_at = NULL,
           verified_at = ?, unsubscribed_at = NULL, updated_at = ?
         WHERE id = ? AND email_status = 'pending'`,
      )
      .bind(now, now, row.id),
    db
      .prepare(
        `INSERT INTO email_subscription_events (
           id, user_id, event_type, idempotency_key, created_at
         ) VALUES (?, ?, 'verified', ?, ?)
         ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), row.id, idempotencyKey, now),
  ])
  return getEmailSubscription(db, row.profile_id)
}

export async function unsubscribeEmail(
  db: D1Database,
  profileId: string,
  idempotencyKey: string,
): Promise<EmailSubscription | undefined> {
  const existing = await getEmailSubscription(db, profileId)
  if (!existing) return undefined
  if (await hasSubscriptionEvent(db, existing.id, idempotencyKey)) {
    return existing
  }
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE users SET email_status = 'unsubscribed',
           verification_token_hash = NULL, verification_expires_at = NULL,
           unsubscribed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, existing.id),
    db
      .prepare(
        `INSERT INTO email_subscription_events (
           id, user_id, event_type, idempotency_key, created_at
         ) VALUES (?, ?, 'unsubscribed', ?, ?)
         ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), existing.id, idempotencyKey, now),
  ])
  return getEmailSubscription(db, profileId)
}

export async function getVerifiedEmailRecipient(
  db: D1Database,
  profileId: string,
): Promise<string | undefined> {
  const row = await db
    .prepare(
      `SELECT email FROM users
       WHERE profile_id = ? AND email_status = 'verified' LIMIT 1`,
    )
    .bind(profileId)
    .first<{ email: string }>()
  return row?.email
}
