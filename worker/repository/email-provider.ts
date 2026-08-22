export type EmailProviderCredential = {
  profileId: string
  encryptedApiKey: string
  encryptionIv: string
  mailFrom: string
  sendHourLocal: number
}

type CredentialRow = {
  profile_id: string
  encrypted_api_key: string
  encryption_iv: string
  mail_from: string
  send_hour_local: number
}

function mapCredential(row: CredentialRow): EmailProviderCredential {
  return {
    profileId: row.profile_id,
    encryptedApiKey: row.encrypted_api_key,
    encryptionIv: row.encryption_iv,
    mailFrom: row.mail_from,
    sendHourLocal: row.send_hour_local,
  }
}

export async function getEmailProviderCredential(
  db: D1Database,
  profileId: string,
): Promise<EmailProviderCredential | undefined> {
  const row = await db
    .prepare(
      `SELECT profile_id, encrypted_api_key, encryption_iv, mail_from,
              send_hour_local
       FROM email_provider_credentials WHERE profile_id = ? LIMIT 1`,
    )
    .bind(profileId)
    .first<CredentialRow>()
  return row ? mapCredential(row) : undefined
}

export async function saveEmailProviderCredential(input: {
  db: D1Database
  profileId: string
  encryptedApiKey: string
  encryptionIv: string
  mailFrom: string
  sendHourLocal: number
}): Promise<EmailProviderCredential> {
  const now = new Date().toISOString()
  await input.db
    .prepare(
      `INSERT INTO email_provider_credentials (
         profile_id, provider, encrypted_api_key, encryption_iv, mail_from,
         send_hour_local, created_at, updated_at
       ) VALUES (?, 'resend', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET
         encrypted_api_key = excluded.encrypted_api_key,
         encryption_iv = excluded.encryption_iv,
         mail_from = excluded.mail_from,
         send_hour_local = excluded.send_hour_local,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.profileId,
      input.encryptedApiKey,
      input.encryptionIv,
      input.mailFrom,
      input.sendHourLocal,
      now,
      now,
    )
    .run()
  const saved = await getEmailProviderCredential(input.db, input.profileId)
  if (!saved) throw new Error('EMAIL_PROVIDER_CREDENTIAL_SAVE_FAILED')
  return saved
}

export type VerifiedEmailTarget = {
  profileId: string
  email: string
  timeZone: string
  encryptedApiKey?: string
  encryptionIv?: string
  mailFrom?: string
  sendHourLocal?: number
}

export async function listVerifiedEmailTargets(
  db: D1Database,
): Promise<VerifiedEmailTarget[]> {
  const result = await db
    .prepare(
      `SELECT user.profile_id, user.email, user.timezone,
              credential.encrypted_api_key, credential.encryption_iv,
              credential.mail_from, credential.send_hour_local
       FROM users AS user
       LEFT JOIN email_provider_credentials AS credential
         ON credential.profile_id = user.profile_id
       JOIN accounts AS account ON account.profile_id = user.profile_id
       WHERE user.email_status = 'verified' AND account.status = 'active'
       ORDER BY user.profile_id ASC`,
    )
    .all<{
      profile_id: string
      email: string
      timezone: string
      encrypted_api_key: string | null
      encryption_iv: string | null
      mail_from: string | null
      send_hour_local: number | null
    }>()
  return result.results.map((row) => ({
    profileId: row.profile_id,
    email: row.email,
    timeZone: row.timezone,
    encryptedApiKey: row.encrypted_api_key ?? undefined,
    encryptionIv: row.encryption_iv ?? undefined,
    mailFrom: row.mail_from ?? undefined,
    sendHourLocal: row.send_hour_local ?? undefined,
  }))
}
