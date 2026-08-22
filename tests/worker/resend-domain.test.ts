import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyResendSendingDomain } from '../../worker/providers/resend'

describe('Resend sending-domain verification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('probes the exact custom domain with a stable, non-delivering request', async () => {
    let capturedInit: RequestInit | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe('https://api.resend.com/emails')
      capturedInit = init
      return Promise.resolve(Response.json({ id: 'domain-probe-fixture' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyResendSendingDomain(
        ['re', 'verifiedfixture000'].join('_'),
        ['Study <hello', 'mail.example.com>'].join('@'),
      ),
    ).resolves.toEqual({ verified: true, domain: 'mail.example.com' })

    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('authorization')).toMatch(/^Bearer re_/)
    expect(headers.get('idempotency-key')).toMatch(
      /^provider-domain-check\/[a-f0-9]+$/,
    )
    expect(typeof capturedInit?.body).toBe('string')
    const body: unknown = JSON.parse(capturedInit?.body as string)
    expect(body).toMatchObject({
      from: ['Study <hello', 'mail.example.com>'].join('@'),
      to: [['delivered', 'resend.dev'].join('@')],
    })
  })

  it.each([401, 403])(
    'rejects a key or sending domain rejected with %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json({}, { status }))),
      )
      await expect(
        verifyResendSendingDomain(
          ['re', 'unverifiedfixture000'].join('_'),
          ['hello', 'mail.example.com'].join('@'),
        ),
      ).resolves.toEqual({
        verified: false,
        reason: 'credentials_or_domain_rejected',
      })
    },
  )

  it('rejects Resend default testing senders without a network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      verifyResendSendingDomain(
        ['re', 'testingfixture000'].join('_'),
        ['onboarding', 'resend.dev'].join('@'),
      ),
    ).resolves.toEqual({ verified: false, reason: 'test_domain_not_allowed' })
    await expect(
      verifyResendSendingDomain(
        ['re', 'malformedfixture000'].join('_'),
        'not-an-address',
      ),
    ).resolves.toEqual({ verified: false, reason: 'invalid_sender' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
