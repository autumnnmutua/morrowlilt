import { fetchJsonWithPolicy } from '../http/fetch-json'
import type { DailyEmailMessage, EmailProvider } from './contracts'

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
