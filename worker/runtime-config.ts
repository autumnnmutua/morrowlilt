export type ResendRuntimeConfig = {
  apiKey: string
  mailFrom: string
  recipientEmail: string
  publicSiteUrl: string
  sendHourLocal: number
}

export type ResendSenderRuntimeConfig = Omit<
  ResendRuntimeConfig,
  'recipientEmail'
>

export type AccessRuntimeConfig = {
  issuer: string
  audience: string
  jwksUrl: string
}

function readOptionalBinding(env: Env, key: string): string | undefined {
  const value: unknown = Reflect.get(env, key)
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized || normalized.includes('<PLACEHOLDER>')) return undefined
  return normalized
}

export function getContentProviderConfig(
  env: Env,
): { endpoint: string; apiKey?: string } | undefined {
  const endpoint = readOptionalBinding(env, 'CONTENT_PROVIDER_URL')
  if (!endpoint) return undefined
  return {
    endpoint,
    apiKey: readOptionalBinding(env, 'CONTENT_API_KEY'),
  }
}

export function isWorkersAiContentEnabled(env: Env): boolean {
  return readOptionalBinding(env, 'AI_CONTENT_ENABLED') === 'true'
}

function isAiBinding(value: unknown): value is Ai {
  return (
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    typeof value.run === 'function'
  )
}

export function getWorkersAiBinding(env: Env): Ai | undefined {
  const value: unknown = Reflect.get(env, 'AI')
  return isAiBinding(value) ? value : undefined
}

export function getAdminApiKey(env: Env): string | undefined {
  return readOptionalBinding(env, 'ADMIN_API_KEY')
}

export function getAccessConfig(env: Env): AccessRuntimeConfig | undefined {
  const teamDomain = readOptionalBinding(env, 'ACCESS_TEAM_DOMAIN')
  const audience = readOptionalBinding(env, 'ACCESS_AUD')
  if (!teamDomain || !audience || audience.length > 512) return undefined
  try {
    const url = new URL(
      teamDomain.startsWith('https://') ? teamDomain : `https://${teamDomain}`,
    )
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.cloudflareaccess.com') ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      return undefined
    }
    const issuer = url.origin
    return {
      issuer,
      audience,
      jwksUrl: `${issuer}/cdn-cgi/access/certs`,
    }
  } catch {
    return undefined
  }
}

export function getResendConfig(env: Env): ResendRuntimeConfig | undefined {
  const sender = getResendSenderConfig(env)
  const recipientEmail = readOptionalBinding(env, 'RECIPIENT_EMAIL')
  if (!sender || !recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
    return undefined
  }
  return { ...sender, recipientEmail }
}

export function getResendSenderConfig(
  env: Env,
): ResendSenderRuntimeConfig | undefined {
  const apiKey = readOptionalBinding(env, 'RESEND_API_KEY')
  const mailFrom = readOptionalBinding(env, 'MAIL_FROM')
  const publicSiteUrl = readOptionalBinding(env, 'PUBLIC_SITE_URL')
  const sendHour = readOptionalBinding(env, 'MAIL_SEND_HOUR_LOCAL')
  if (
    !apiKey ||
    !mailFrom ||
    !publicSiteUrl ||
    !sendHour ||
    !/^\d{1,2}$/.test(sendHour)
  ) {
    return undefined
  }
  if (!/^.+<\S+@\S+\.\S+>$|^\S+@\S+\.\S+$/.test(mailFrom)) return undefined
  try {
    const url = new URL(publicSiteUrl)
    if (url.protocol !== 'https:') return undefined
  } catch {
    return undefined
  }
  const sendHourLocal = Number(sendHour)
  if (sendHourLocal < 0 || sendHourLocal > 23) return undefined
  return {
    apiKey,
    mailFrom,
    publicSiteUrl,
    sendHourLocal,
  }
}

export function getPublicSiteUrl(env: Env): string | undefined {
  const value = readOptionalBinding(env, 'PUBLIC_SITE_URL')
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function getUserSecretEncryptionKey(env: Env): string | undefined {
  const value = readOptionalBinding(env, 'USER_SECRET_ENCRYPTION_KEY')
  return value && value.length >= 32 ? value : undefined
}
