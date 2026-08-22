import {
  isRecord,
  validateAndSanitizeDailyContentCandidate,
} from '../content/schema'
import { fetchJsonWithPolicy } from '../http/fetch-json'
import type {
  ContentGenerationContext,
  ContentProvider,
  DailyContentCandidate,
} from './contracts'

export class HttpContentProvider implements ContentProvider {
  readonly name = 'configured-http-content'
  private readonly endpoint: string
  private readonly apiKey?: string

  constructor(endpoint: string, apiKey?: string) {
    this.endpoint = endpoint
    this.apiKey = apiKey
  }

  async generateDailyContent(
    contentDate: string,
    timeZone: string,
    context: ContentGenerationContext = {
      attempt: 1,
      recentFingerprints: [],
      regeneration: false,
    },
    signal?: AbortSignal,
  ): Promise<DailyContentCandidate> {
    const endpoint = new URL(this.endpoint)
    if (endpoint.protocol !== 'https:') {
      throw new Error('Content provider URL must use HTTPS')
    }

    const headers = new Headers({ 'content-type': 'application/json' })
    if (this.apiKey) headers.set('authorization', `Bearer ${this.apiKey}`)

    const candidate = await fetchJsonWithPolicy(
      endpoint.toString(),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ contentDate, timeZone, context }),
      },
      {
        operation: 'content.generate_daily',
        timeoutMs: 6_000,
        maxAttempts: 2,
        maxResponseBytes: 128 * 1024,
        validate: isRecord,
      },
      signal,
    )

    return validateAndSanitizeDailyContentCandidate(
      candidate,
      contentDate,
      this.name,
    )
  }
}
