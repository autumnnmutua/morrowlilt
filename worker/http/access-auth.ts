import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'
import { getAccessConfig, type AccessRuntimeConfig } from '../runtime-config'

export class AccessAuthError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'AccessAuthError'
    this.code = code
    this.status = status
  }
}

type LocalJwks = Parameters<typeof createLocalJWKSet>[0]

function isLocalOrTestHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.invalid')
  )
}

export async function verifyAccessJwt(
  token: string,
  config: AccessRuntimeConfig,
  localJwks?: LocalJwks,
): Promise<void> {
  const keySet = localJwks
    ? createLocalJWKSet(localJwks)
    : createRemoteJWKSet(new URL(config.jwksUrl), {
        cacheMaxAge: 10 * 60 * 1000,
        cooldownDuration: 60 * 1000,
        timeoutDuration: 5_000,
      })
  await jwtVerify(token, keySet, {
    algorithms: ['RS256'],
    audience: config.audience,
    issuer: config.issuer,
  })
}

export async function requireAccessAuthorization(
  request: Request,
  env: Env,
  options: { allowLocalAndTest?: boolean; localJwks?: LocalJwks } = {},
): Promise<void> {
  const url = new URL(request.url)
  if (options.allowLocalAndTest !== false && isLocalOrTestHost(url.hostname)) {
    return
  }

  const config = getAccessConfig(env)
  if (!config) {
    throw new AccessAuthError(
      'ACCESS_NOT_CONFIGURED',
      'Private access is not configured',
      503,
    )
  }
  const token = request.headers.get('cf-access-jwt-assertion')?.trim() ?? ''
  if (!token || token.length > 8_192) {
    throw new AccessAuthError(
      'ACCESS_TOKEN_REQUIRED',
      'Private access authorization is required',
      403,
    )
  }
  try {
    await verifyAccessJwt(token, config, options.localJwks)
  } catch {
    throw new AccessAuthError(
      'ACCESS_TOKEN_INVALID',
      'Private access authorization is invalid',
      403,
    )
  }
}

export function requireSameOriginMutation(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return
  const url = new URL(request.url)
  if (isLocalOrTestHost(url.hostname)) return

  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  const requestedWith = request.headers.get('x-requested-with')
  const originMatches = (() => {
    try {
      return Boolean(origin && new URL(origin).origin === url.origin)
    } catch {
      return false
    }
  })()
  if (
    !originMatches ||
    (fetchSite !== null &&
      fetchSite !== 'same-origin' &&
      fetchSite !== 'none') ||
    requestedWith !== 'morrowlilt-web'
  ) {
    throw new AccessAuthError(
      'CROSS_ORIGIN_WRITE_BLOCKED',
      'This write request was not submitted by the private site',
      403,
    )
  }
}
