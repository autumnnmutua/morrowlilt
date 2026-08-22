import { sanitizePlainText } from '../content/schema'
import { ExternalServiceError, fetchJsonWithPolicy } from '../http/fetch-json'
import type {
  DictionaryEntry,
  DictionaryLicense,
  DictionaryPartOfSpeech,
  DictionaryPronunciation,
  DictionaryProvider,
  DictionaryProviderResult,
  DictionarySense,
} from './contracts'
import { addEntryInflections } from '../dictionary/morphology'

const defaultBaseUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, maxLength = 4_000): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength) return undefined
  const clean = sanitizePlainText(value)
  return clean || undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const clean = text(item, 200)
    return clean ? [clean] : []
  })
}

function safeUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== 'string' || value.length > 1_000) return undefined
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function license(value: unknown): DictionaryLicense | undefined {
  if (!isRecord(value)) return undefined
  const name = text(value.name, 160)
  if (!name) return undefined
  return { name, url: safeUrl(value.url) }
}

function pronunciation(value: unknown): DictionaryPronunciation | undefined {
  if (!isRecord(value)) return undefined
  const result: DictionaryPronunciation = {
    text: text(value.text, 200),
    audioUrl: safeUrl(value.audio, 'https://api.dictionaryapi.dev'),
    sourceUrl: safeUrl(value.sourceUrl),
    license: license(value.license),
  }
  return result.text || result.audioUrl ? result : undefined
}

function sense(value: unknown): DictionarySense | undefined {
  if (!isRecord(value)) return undefined
  const definition = text(value.definition)
  if (!definition) return undefined
  const example = text(value.example)
  return {
    definition,
    definitionSourceType: 'dictionary',
    examples: example ? [{ text: example, sourceType: 'dictionary' }] : [],
    synonyms: stringList(value.synonyms),
    antonyms: stringList(value.antonyms),
  }
}

function partOfSpeech(value: unknown): DictionaryPartOfSpeech | undefined {
  if (!isRecord(value)) return undefined
  const label = text(value.partOfSpeech, 100)
  if (!label || !Array.isArray(value.definitions)) return undefined
  const senses = value.definitions.flatMap((item) => {
    const parsed = sense(item)
    return parsed ? [parsed] : []
  })
  if (senses.length === 0) return undefined
  return {
    label,
    senses,
    synonyms: stringList(value.synonyms),
    antonyms: stringList(value.antonyms),
  }
}

function entry(value: unknown): DictionaryEntry | undefined {
  if (!isRecord(value)) return undefined
  const headword = text(value.word, 200)
  if (!headword || !Array.isArray(value.meanings)) return undefined
  const partsOfSpeech = value.meanings.flatMap((item) => {
    const parsed = partOfSpeech(item)
    return parsed ? [parsed] : []
  })
  if (partsOfSpeech.length === 0) return undefined
  const pronunciations = Array.isArray(value.phonetics)
    ? value.phonetics.flatMap((item) => {
        const parsed = pronunciation(item)
        return parsed ? [parsed] : []
      })
    : []
  const directPhonetic = text(value.phonetic, 200)
  if (
    directPhonetic &&
    !pronunciations.some((item) => item.text === directPhonetic)
  ) {
    pronunciations.unshift({ text: directPhonetic })
  }
  return addEntryInflections({
    headword,
    phonetic: directPhonetic ?? pronunciations.find((item) => item.text)?.text,
    pronunciations,
    forms: stringList(value.forms),
    origin: text(value.origin),
    partsOfSpeech,
    sourceUrls: stringList(value.sourceUrls).flatMap((url) => {
      const safe = safeUrl(url)
      return safe ? [safe] : []
    }),
    license: license(value.license),
  })
}

function isDictionaryPayload(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord)
}

export class FreeDictionaryProvider implements DictionaryProvider {
  readonly name = 'free-dictionary-api-v2'
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(baseUrl = defaultBaseUrl, timeoutMs = 4_500) {
    this.baseUrl = baseUrl
    this.timeoutMs = timeoutMs
  }

  parseCachedPayload(
    payload: unknown,
    requestUrl: string,
  ): DictionaryProviderResult {
    if (!isDictionaryPayload(payload)) {
      throw new ExternalServiceError(
        'EXTERNAL_INVALID_PAYLOAD',
        'Dictionary payload was invalid',
        false,
      )
    }
    const entries = payload.flatMap((item) => {
      const parsed = entry(item)
      return parsed ? [parsed] : []
    })
    if (entries.length === 0) {
      throw new ExternalServiceError(
        'EXTERNAL_INVALID_PAYLOAD',
        'Dictionary payload contained no usable entries',
        false,
      )
    }
    const licenses: DictionaryLicense[] = []
    for (const item of entries) {
      if (item.license) licenses.push(item.license)
      for (const phonetic of item.pronunciations) {
        if (phonetic.license) licenses.push(phonetic.license)
      }
    }
    return {
      entries,
      rawPayload: payload,
      requestUrl,
      licenses,
      attribution:
        'Definitions and lexical data via Free Dictionary API; source and license are preserved per entry.',
    }
  }

  async lookup(
    term: string,
    signal?: AbortSignal,
  ): Promise<DictionaryProviderResult> {
    const requestUrl = `${this.baseUrl}/${encodeURIComponent(term)}`
    const payload = await fetchJsonWithPolicy(
      requestUrl,
      { headers: { accept: 'application/json' } },
      {
        operation: 'dictionary_lookup',
        timeoutMs: this.timeoutMs,
        maxAttempts: 2,
        maxResponseBytes: 512 * 1024,
        validate: isDictionaryPayload,
      },
      signal,
    )
    return this.parseCachedPayload(payload, requestUrl)
  }
}
