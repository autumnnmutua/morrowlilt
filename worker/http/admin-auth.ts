import { getAdminApiKey } from '../runtime-config'

export class AdminAuthError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'AdminAuthError'
    this.code = code
    this.status = status
  }
}

async function hashSecret(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

export async function requireAdminAuthorization(
  request: Request,
  env: Env,
): Promise<void> {
  const expected = getAdminApiKey(env)
  if (!expected) {
    throw new AdminAuthError(
      'ADMIN_NOT_CONFIGURED',
      'Administrator content operations are not configured',
      503,
    )
  }
  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  const [providedHash, expectedHash] = await Promise.all([
    hashSecret(provided),
    hashSecret(expected),
  ])
  if (!crypto.subtle.timingSafeEqual(providedHash, expectedHash)) {
    throw new AdminAuthError(
      'ADMIN_UNAUTHORIZED',
      'Administrator authorization is required',
      401,
    )
  }
}
