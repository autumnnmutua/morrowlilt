import { env } from 'cloudflare:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  AccessAuthError,
  requireAccessAuthorization,
  requireSameOriginMutation,
} from '../../worker/http/access-auth'

const issuer = 'https://private-study.cloudflareaccess.com'
const audience = 'private-study-audience'

function accessEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_AUD: audience,
    ...overrides,
  }
}

async function signedAccessToken(input: {
  issuer?: string
  audience?: string
}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = 'access-test-key'
  const token = await new SignJWT({ email: 'masked-user' })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  return { token, jwks: { keys: [publicJwk] } }
}

describe('private Access and same-origin gates', () => {
  it('verifies signature, issuer and audience', async () => {
    const { token, jwks } = await signedAccessToken({})
    const request = new Request('https://study.example.com/api/health', {
      headers: { 'cf-access-jwt-assertion': token },
    })
    await expect(
      requireAccessAuthorization(request, accessEnv(), {
        allowLocalAndTest: false,
        localJwks: jwks,
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    {
      claims: { issuer: 'https://wrong.cloudflareaccess.com' },
      label: 'issuer',
    },
    { claims: { audience: 'wrong-audience' }, label: 'audience' },
  ])('rejects a token with the wrong $label claim', async ({ claims }) => {
    const { token, jwks } = await signedAccessToken(claims)
    const request = new Request('https://study.example.com/api/health', {
      headers: { 'cf-access-jwt-assertion': token },
    })
    await expect(
      requireAccessAuthorization(request, accessEnv(), {
        allowLocalAndTest: false,
        localJwks: jwks,
      }),
    ).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_INVALID',
    } satisfies Partial<AccessAuthError>)
  })

  it('fails closed when production Access settings are missing', async () => {
    await expect(
      requireAccessAuthorization(
        new Request('https://study.example.com/api/health'),
        accessEnv({ ACCESS_TEAM_DOMAIN: '<PLACEHOLDER>' }),
        { allowLocalAndTest: false },
      ),
    ).rejects.toMatchObject({
      code: 'ACCESS_NOT_CONFIGURED',
    } satisfies Partial<AccessAuthError>)
  })

  it('blocks cross-origin or unmarked writes and accepts same-origin site writes', () => {
    expect(() =>
      requireSameOriginMutation(
        new Request('https://study.example.com/api/checkin', {
          method: 'POST',
          headers: {
            origin: 'https://attacker.example',
            'sec-fetch-site': 'cross-site',
          },
        }),
      ),
    ).toThrowError(AccessAuthError)

    expect(() =>
      requireSameOriginMutation(
        new Request('https://study.example.com/api/checkin', {
          method: 'POST',
          headers: {
            origin: 'https://study.example.com',
            'sec-fetch-site': 'same-origin',
            'x-requested-with': 'morrowlilt-web',
          },
        }),
      ),
    ).not.toThrow()
  })
})
