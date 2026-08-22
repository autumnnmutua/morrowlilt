import { fetchJsonWithPolicy } from '../http/fetch-json'

type Suggestion = { word: string; score?: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSuggestionPayload(value: unknown): value is Suggestion[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (item) =>
        isRecord(item) &&
        'word' in item &&
        typeof item.word === 'string' &&
        item.word.length >= 1 &&
        item.word.length <= 120,
    )
  )
}

export class DatamuseSuggestionProvider {
  readonly name = 'datamuse-suggestions'

  async suggest(query: string, signal?: AbortSignal): Promise<string[]> {
    const url = `https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=12`
    const payload = await fetchJsonWithPolicy(
      url,
      { headers: { accept: 'application/json' } },
      {
        operation: 'dictionary_suggestions',
        timeoutMs: 2_500,
        maxAttempts: 2,
        maxResponseBytes: 32 * 1024,
        validate: isSuggestionPayload,
      },
      signal,
    )
    return payload.map((item) => item.word)
  }
}
