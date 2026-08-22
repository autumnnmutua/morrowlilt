import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose'
import { getAccessConfig, type AccessRuntimeConfig } from '../runtime-config'
import type { AuthenticatedIdentity } from '../repository/accounts'

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
): Promise<JWTPayload> {
  const keySet = localJwks
    ? createLocalJWKSet(localJwks)
    : createRemoteJWKSet(new URL(config.jwksUrl), {
        cacheMaxAge: 10 * 60 * 1000,
        cooldownDuration: 60 * 1000,
        timeoutDuration: 5_000,
      })
  const result = await jwtVerify(token, keySet, {
    algorithms: ['RS256'],
    audience: config.audience,
    issuer: config.issuer,
  })
  return result.payload
}

export async function requireAccessAuthorization(
  request: Request,
  env: Env,
  options: { allowLocalAndTest?: boolean; localJwks?: LocalJwks } = {},
): Promise<AuthenticatedIdentity> {
  const url = new URL(request.url)
  if (options.allowLocalAndTest !== false && isLocalOrTestHost(url.hostname)) {
    const subject =
      request.headers.get('x-morrowlilt-test-subject')?.trim() ||
      'local-default'
    const email =
      request.headers.get('x-morrowlilt-test-email')?.trim() ||
      ['local-user', 'example.invalid'].join('@')
    return {
      issuer: 'https://local.invalid',
      subject: subject.slice(0, 512),
      email,
      profileHint: subject === 'local-default' ? 'default' : undefined,
    }
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
    const payload = await verifyAccessJwt(token, config, options.localJwks)
    if (
      payload.type !== 'app' ||
      typeof payload.sub !== 'string' ||
      payload.sub.length < 1 ||
      payload.sub.length > 512 ||
      typeof payload.email !== 'string' ||
      payload.email.length < 3 ||
      payload.email.length > 254 ||
      typeof payload.iss !== 'string'
    ) {
      throw new Error('Access identity claims are incomplete')
    }
    return {
      issuer: payload.iss,
      subject: payload.sub,
      email: payload.email,
    }
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
