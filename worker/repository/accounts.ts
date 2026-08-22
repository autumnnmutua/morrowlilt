import { getLocalDate } from '../time/business-date'

export type AuthenticatedIdentity = {
  issuer: string
  subject: string
  email: string
  profileHint?: string
}

export type AccountContext = {
  accountId: string
  profileId: string
  loginEmailHash: string
  status: 'active' | 'disabled'
}

type AccountRow = {
  id: string
  profile_id: string
  login_email_hash: string
  status: AccountContext['status']
}

function mapAccount(row: AccountRow): AccountContext {
  return {
    accountId: row.id,
    profileId: row.profile_id,
    loginEmailHash: row.login_email_hash,
    status: row.status,
  }
}

export function normalizeIdentityEmail(value: string): string {
  const normalized = value.trim().normalize('NFKC').toLowerCase()
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      normalized,
    )
  ) {
    throw new Error('ACCESS_IDENTITY_EMAIL_INVALID')
  }
  return normalized
}

export async function hashIdentityValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function findByIdentity(
  db: D1Database,
  issuer: string,
  subject: string,
): Promise<AccountContext | undefined> {
  const row = await db
    .prepare(
      `SELECT account.id, account.profile_id, account.login_email_hash, account.status
       FROM auth_identities AS identity
       JOIN accounts AS account ON account.id = identity.account_id
       WHERE identity.issuer = ? AND identity.subject = ?
         AND identity.status = 'active'
       LIMIT 1`,
    )
    .bind(issuer, subject)
    .first<AccountRow>()
  return row ? mapAccount(row) : undefined
}

async function findByEmailHash(
  db: D1Database,
  emailHash: string,
): Promise<AccountContext | undefined> {
  const row = await db
    .prepare(
      `SELECT id, profile_id, login_email_hash, status
       FROM accounts WHERE login_email_hash = ? LIMIT 1`,
    )
    .bind(emailHash)
    .first<AccountRow>()
  return row ? mapAccount(row) : undefined
}

function stableId(prefix: string, emailHash: string): string {
  return `${prefix}_${emailHash.slice(0, 40)}`
}

export async function ensureAccountForIdentity(input: {
  db: D1Database
  identity: AuthenticatedIdentity
  defaultTimeZone: string
  ownerEmail?: string
  allowReauthorize?: boolean
  now?: Date
}): Promise<AccountContext> {
  const email = normalizeIdentityEmail(input.identity.email)
  const emailHash = await hashIdentityValue(email)
  const existingIdentity = await findByIdentity(
    input.db,
    input.identity.issuer,
    input.identity.subject,
  )
  if (existingIdentity) {
    if (existingIdentity.loginEmailHash !== emailHash) {
      throw new Error('ACCESS_IDENTITY_EMAIL_CHANGED')
    }
    if (existingIdentity.status !== 'active') {
      if (!input.allowReauthorize) throw new Error('ACCOUNT_DISABLED')
      await setAccountStatus(input.db, existingIdentity.profileId, 'active')
      return { ...existingIdentity, status: 'active' }
    }
    const now = (input.now ?? new Date()).toISOString()
    await input.db
      .prepare(
        `UPDATE auth_identities SET last_seen_at = ?
         WHERE issuer = ? AND subject = ?`,
      )
      .bind(now, input.identity.issuer, input.identity.subject)
      .run()
    return existingIdentity
  }

  const existingEmailAccount = await findByEmailHash(input.db, emailHash)
  if (existingEmailAccount?.status === 'disabled' && !input.allowReauthorize) {
    throw new Error('ACCOUNT_DISABLED')
  }
  const ownerHash = input.ownerEmail
    ? await hashIdentityValue(normalizeIdentityEmail(input.ownerEmail))
    : undefined
  const profileId =
    existingEmailAccount?.profileId ??
    input.identity.profileHint ??
    (ownerHash === emailHash ? 'default' : stableId('profile', emailHash))
  const accountId =
    existingEmailAccount?.accountId ?? stableId('account', emailHash)
  const identityId = stableId(
    'identity',
    await hashIdentityValue(`${input.identity.issuer}\u0000${emailHash}`),
  )
  const nowDate = input.now ?? new Date()
  const now = nowDate.toISOString()
  const createdDate = getLocalDate(input.defaultTimeZone, nowDate)
  const eventType = existingEmailAccount ? 'identity_reauthorized' : 'created'

  await input.db.batch([
    input.db
      .prepare(
        `INSERT INTO app_profile (
           id, time_zone, created_date, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(profileId, input.defaultTimeZone, createdDate, now, now),
    input.db
      .prepare(
        `INSERT INTO accounts (
           id, profile_id, login_email_hash, status, version, created_at, updated_at
         ) VALUES (?, ?, ?, 'active', 1, ?, ?)
         ON CONFLICT(login_email_hash) DO UPDATE SET
           status = 'active', version = accounts.version + 1,
           updated_at = excluded.updated_at`,
      )
      .bind(accountId, profileId, emailHash, now, now),
    input.db
      .prepare(
        `INSERT INTO auth_identities (
           id, account_id, issuer, subject, email_hash, status, created_at, last_seen_at
         ) SELECT ?, account.id, ?, ?, ?, 'active', ?, ?
           FROM accounts AS account WHERE account.login_email_hash = ?
         ON CONFLICT(issuer, email_hash) DO UPDATE SET
           subject = excluded.subject, status = 'active',
           last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        identityId,
        input.identity.issuer,
        input.identity.subject,
        emailHash,
        now,
        now,
        emailHash,
      ),
    input.db
      .prepare(
        `INSERT INTO account_events (id, account_id, event_type, created_at)
         SELECT ?, id, ?, ? FROM accounts WHERE login_email_hash = ?`,
      )
      .bind(crypto.randomUUID(), eventType, now, emailHash),
  ])

  const account = await findByIdentity(
    input.db,
    input.identity.issuer,
    input.identity.subject,
  )
  if (!account) throw new Error('ACCOUNT_PROVISION_FAILED')
  return account
}

async function setAccountStatus(
  db: D1Database,
  profileId: string,
  status: AccountContext['status'],
): Promise<void> {
  const now = new Date().toISOString()
  const eventType = status === 'active' ? 'enabled' : 'disabled'
  await db.batch([
    db
      .prepare(
        `UPDATE accounts
       SET status = ?, version = version + 1, updated_at = ?
       WHERE profile_id = ?`,
      )
      .bind(status, now, profileId),
    db
      .prepare(
        `UPDATE users SET email_status = 'unsubscribed', updated_at = ?
       WHERE profile_id = ? AND ? = 'disabled'`,
      )
      .bind(now, profileId, status),
    db
      .prepare(
        `INSERT INTO account_events (id, account_id, event_type, created_at)
       SELECT ?, id, ?, ? FROM accounts WHERE profile_id = ?`,
      )
      .bind(crypto.randomUUID(), eventType, now, profileId),
  ])
}

export async function disableAccount(
  db: D1Database,
  profileId: string,
): Promise<void> {
  await setAccountStatus(db, profileId, 'disabled')
}

export async function revokeIdentity(input: {
  db: D1Database
  issuer: string
  subject: string
}): Promise<void> {
  const now = new Date().toISOString()
  await input.db.batch([
    input.db
      .prepare(
        `UPDATE auth_identities SET status = 'revoked', last_seen_at = ?
         WHERE issuer = ? AND subject = ?`,
      )
      .bind(now, input.issuer, input.subject),
    input.db
      .prepare(
        `INSERT INTO account_events (id, account_id, event_type, created_at)
         SELECT ?, account_id, 'identity_revoked', ?
         FROM auth_identities WHERE issuer = ? AND subject = ?`,
      )
      .bind(crypto.randomUUID(), now, input.issuer, input.subject),
  ])
}
