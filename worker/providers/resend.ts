import { ExternalServiceError, fetchJsonWithPolicy } from '../http/fetch-json'
import type { DailyEmailMessage, EmailProvider } from './contracts'

function senderDomain(mailFrom: string): string | undefined {
  const address = /<([^<>]+)>\s*$/.exec(mailFrom.trim())?.[1] ?? mailFrom.trim()
  const separator = address.lastIndexOf('@')
  if (separator < 1 || separator === address.length - 1) return undefined
  const domain = address.slice(separator + 1).toLowerCase()
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
    ? domain
    : undefined
}

export type ResendDomainVerification =
  | { verified: true; domain: string }
  | {
      verified: false
      reason:
        | 'invalid_sender'
        | 'test_domain_not_allowed'
        | 'credentials_or_domain_rejected'
    }

async function domainProbeIdempotencyKey(
  apiKey: string,
  mailFrom: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${apiKey}\u0000${mailFrom}`),
  )
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `provider-domain-check/${hex.slice(0, 40)}`
}

/**
 * Confirms a least-privilege sending-only key can send from the configured
 * custom domain. Resend rejects this probe when the exact From domain is not
 * verified or the key is not authorized for it. The probe goes only to
 * Resend's non-delivering test address, never to a person.
 */
export async function verifyResendSendingDomain(
  apiKey: string,
  mailFrom: string,
  signal?: AbortSignal,
): Promise<ResendDomainVerification> {
  const domain = senderDomain(mailFrom)
  if (!domain) return { verified: false, reason: 'invalid_sender' }
  if (domain === 'resend.dev') {
    return { verified: false, reason: 'test_domain_not_allowed' }
  }

  try {
    await fetchJsonWithPolicy(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': await domainProbeIdempotencyKey(apiKey, mailFrom),
          'user-agent': 'morrowlilt-worker/1.0',
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [['delivered', 'resend.dev'].join('@')],
          subject: 'Sending domain verification',
          text: 'This automated message verifies a configured sending domain.',
          html: '<p>This automated message verifies a configured sending domain.</p>',
        }),
      },
      {
        operation: 'email.verify_sending_domain',
        timeoutMs: 5_000,
        maxAttempts: 2,
        maxResponseBytes: 32 * 1024,
        validate: isResendResponse,
      },
      signal,
    )
  } catch (error) {
    if (
      error instanceof ExternalServiceError &&
      (error.status === 401 || error.status === 403)
    ) {
      return { verified: false, reason: 'credentials_or_domain_rejected' }
    }
    throw error
  }
  return { verified: true, domain }
}

function isResendResponse(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0
  )
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'
  private readonly apiKey: string
  private readonly maxAttempts: number
  private readonly timeoutMs: number

  constructor(
    apiKey: string,
    options: { maxAttempts?: number; timeoutMs?: number } = {},
  ) {
    this.apiKey = apiKey
    this.maxAttempts = options.maxAttempts ?? 2
    this.timeoutMs = options.timeoutMs ?? 5_000
  }

  async sendDailyDigest(
    message: DailyEmailMessage,
    signal?: AbortSignal,
  ): Promise<{ messageId: string }> {
    const response = await fetchJsonWithPolicy(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': message.idempotencyKey,
          'user-agent': 'morrowlilt-worker/1.0',
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      },
      {
        operation: 'email.send_daily',
        timeoutMs: this.timeoutMs,
        maxAttempts: this.maxAttempts,
        maxResponseBytes: 32 * 1024,
        validate: isResendResponse,
      },
      signal,
    )
    return { messageId: response.id }
  }
}
