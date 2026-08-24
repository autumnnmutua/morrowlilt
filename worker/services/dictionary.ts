import { ExternalServiceError } from '../http/fetch-json'
import type {
  DictionaryLicense,
  DictionaryProvider,
  DictionaryProviderResult,
  DictionaryTranslationProvider,
} from '../providers/contracts'
import {
  getCachedTranslations,
  getDictionaryCache,
  getSuggestionCache,
  listHistorySuggestions,
  listDictionaryHistory,
  recordDictionarySearch,
  saveCachedTranslations,
  saveDictionaryCache,
  saveSuggestionCache,
  saveDictionaryTerm,
} from '../repository/dictionary'
import {
  listLocalLexiconSuggestions,
  lookupLocalLexicon,
} from '../repository/lexicon'
import {
  getExamDictionaryList,
  listExamDictionaries,
  listExamDictionaryWords,
  lookupExamLexeme,
} from '../repository/exam-dictionary'

const cacheLifetimeMs = 7 * 24 * 60 * 60 * 1_000
const dictionaryAudioHost = 'api.dictionaryapi.dev'
const dictionaryAudioPathPrefix = '/media/pronunciations/'

function validatedDictionaryAudioUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === dictionaryAudioHost &&
      url.pathname.startsWith(dictionaryAudioPathPrefix)
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function proxiedAudioEntries(
  entries: DictionaryProviderResult['entries'],
): DictionaryProviderResult['entries'] {
  return entries.map((entry) => ({
    ...entry,
    pronunciations: entry.pronunciations.map((pronunciation) => {
      const source = pronunciation.audioUrl
        ? validatedDictionaryAudioUrl(pronunciation.audioUrl)
        : undefined
      return {
        ...pronunciation,
        audioUrl: source
          ? `/api/dictionary/audio?src=${encodeURIComponent(source.toString())}`
          : undefined,
      }
    }),
  }))
}

export class DictionaryDomainError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'DictionaryDomainError'
    this.code = code
    this.status = status
  }
}

export function normalizeDictionaryTerm(raw: string): string {
  const normalized = raw
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
  if (
    normalized.length < 1 ||
    normalized.length > 64 ||
    normalized.split(' ').length > 6 ||
    !/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(normalized)
  ) {
    throw new DictionaryDomainError(
      'INVALID_DICTIONARY_TERM',
      'Search must be an English word or short phrase up to 64 characters',
    )
  }
  return normalized
}

export type DictionaryLookupResult = Omit<
  DictionaryProviderResult,
  'rawPayload'
> & {
  normalizedTerm: string
  cacheStatus: 'miss' | 'fresh' | 'stale'
  warningCode?: string
  fetchedAt?: string
  expiresAt?: string
}

function publicResult(
  normalizedTerm: string,
  result: DictionaryProviderResult,
  cacheStatus: DictionaryLookupResult['cacheStatus'],
  dates?: { fetchedAt: string; expiresAt: string },
  warningCode?: string,
): DictionaryLookupResult {
  return {
    normalizedTerm,
    entries: proxiedAudioEntries(result.entries),
    requestUrl: result.requestUrl,
    licenses: result.licenses,
    attribution: result.attribution,
    cacheStatus,
    warningCode,
    ...dates,
  }
}

async function enrichWithChinese(
  db: D1Database,
  result: DictionaryProviderResult,
  provider?: DictionaryTranslationProvider,
): Promise<DictionaryProviderResult> {
  if (!provider) return result
  const texts: string[] = []
  for (const entry of result.entries) {
    for (const part of entry.partsOfSpeech) {
      for (const sense of part.senses) {
        if (!sense.translatedDefinition) texts.push(sense.definition)
        for (const example of sense.examples) {
          if (!example.translation) texts.push(example.text)
        }
      }
    }
  }
  const cached = await getCachedTranslations(db, texts)
  const missing = [...new Set(texts)].filter((text) => !cached.has(text))
  if (missing.length > 0) {
    let generated: Awaited<
      ReturnType<DictionaryTranslationProvider['translateMany']>
    >
    try {
      generated = await provider.translateMany(missing)
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'dictionary_translation_failed',
          provider: provider.name,
          itemCount: missing.length,
          code:
            error instanceof Error
              ? error.message.slice(0, 80)
              : 'UNKNOWN_ERROR',
        }),
      )
      throw new DictionaryDomainError(
        'DICTIONARY_TRANSLATION_UNAVAILABLE',
        'Chinese definitions are temporarily unavailable',
        503,
      )
    }
    if (generated.length !== missing.length) {
      throw new DictionaryDomainError(
        'DICTIONARY_TRANSLATION_INCOMPLETE',
        'Chinese definitions are temporarily incomplete',
        503,
      )
    }
    const records = generated.map((item, index) => ({
      sourceText: missing[index],
      translatedText: item.translatedText,
      provider: provider.name,
      attribution: item.attribution,
    }))
    await saveCachedTranslations(db, records)
    for (const record of records) cached.set(record.sourceText, record)
  }
  const translations = texts.map((text) => cached.get(text))
  if (translations.some((item) => !item)) {
    throw new DictionaryDomainError(
      'DICTIONARY_TRANSLATION_INCOMPLETE',
      'Chinese definitions are temporarily incomplete',
      503,
    )
  }
  let index = 0
  return {
    ...result,
    entries: result.entries.map((entry) => ({
      ...entry,
      partsOfSpeech: entry.partsOfSpeech.map((part) => ({
        ...part,
        senses: part.senses.map((sense) => {
          const translatedDefinition = sense.translatedDefinition
            ? undefined
            : translations[index++]!
          return {
            ...sense,
            translatedDefinition:
              sense.translatedDefinition ??
              (translatedDefinition
                ? {
                    text: translatedDefinition.translatedText,
                    provider: translatedDefinition.provider,
                    attribution: translatedDefinition.attribution,
                    originType: 'translated' as const,
                  }
                : undefined),
            examples: sense.examples.map((example) => {
              const translatedExample = example.translation
                ? undefined
                : translations[index++]!
              return {
                ...example,
                translation:
                  example.translation ??
                  (translatedExample
                    ? {
                        text: translatedExample.translatedText,
                        provider: translatedExample.provider,
                        attribution: translatedExample.attribution,
                        originType: 'translated' as const,
                      }
                    : undefined),
              }
            }),
          }
        }),
      })),
    })),
  }
}

function mergeDictionaryResults(
  primary: DictionaryProviderResult,
  local?: DictionaryProviderResult,
): DictionaryProviderResult {
  if (!local) return primary
  const entries = structuredClone(primary.entries)
  for (const localEntry of local.entries) {
    const existing = entries.find(
      (entry) =>
        entry.headword.toLocaleLowerCase('en') ===
        localEntry.headword.toLocaleLowerCase('en'),
    )
    if (!existing) {
      entries.push(localEntry)
      continue
    }
    existing.forms = [...new Set([...existing.forms, ...localEntry.forms])]
    existing.inflections = [
      ...new Map(
        [...existing.inflections, ...localEntry.inflections].map((item) => [
          `${item.form}\u0000${item.label}`,
          item,
        ]),
      ).values(),
    ]
    existing.sourceUrls = [
      ...new Set([...existing.sourceUrls, ...localEntry.sourceUrls]),
    ]
    for (const localPart of localEntry.partsOfSpeech) {
      const part = existing.partsOfSpeech.find(
        (item) => item.label.toLowerCase() === localPart.label.toLowerCase(),
      )
      if (!part) {
        existing.partsOfSpeech.push(localPart)
        continue
      }
      const definitions = new Set(
        part.senses.map((sense) => sense.definition.toLocaleLowerCase('en')),
      )
      part.senses.push(
        ...localPart.senses.filter(
          (sense) => !definitions.has(sense.definition.toLocaleLowerCase('en')),
        ),
      )
      part.synonyms = [...new Set([...part.synonyms, ...localPart.synonyms])]
      part.antonyms = [...new Set([...part.antonyms, ...localPart.antonyms])]
    }
  }
  return {
    ...primary,
    entries,
    licenses: [...primary.licenses, ...local.licenses],
    attribution: `${primary.attribution} ${local.attribution}`,
  }
}

function providerError(error: ExternalServiceError): DictionaryDomainError {
  if (error.status === 404) {
    return new DictionaryDomainError(
      'DICTIONARY_NOT_FOUND',
      'No dictionary entry was found',
      404,
    )
  }
  if (error.status === 429) {
    return new DictionaryDomainError(
      'DICTIONARY_RATE_LIMITED',
      'Dictionary provider is rate limited; please retry later',
      503,
    )
  }
  if (error.code === 'EXTERNAL_TIMEOUT') {
    return new DictionaryDomainError(
      'DICTIONARY_TIMEOUT',
      'Dictionary provider timed out; please retry',
      504,
    )
  }
  return new DictionaryDomainError(
    'DICTIONARY_UNAVAILABLE',
    'Dictionary provider is temporarily unavailable',
    503,
  )
}

export async function lookupDictionary(input: {
  db: D1Database
  profileId: string
  provider: DictionaryProvider
  translationProvider?: DictionaryTranslationProvider
  rawTerm: string
  now?: number
}): Promise<DictionaryLookupResult> {
  const normalizedTerm = normalizeDictionaryTerm(input.rawTerm)
  const now = input.now ?? Date.now()
  const searchedAt = new Date(now).toISOString()
  const [cached, localWordNet, localExam] = await Promise.all([
    getDictionaryCache(input.db, normalizedTerm),
    lookupLocalLexicon(input.db, normalizedTerm),
    lookupExamLexeme(input.db, normalizedTerm),
    recordDictionarySearch(
      input.db,
      input.profileId,
      normalizedTerm,
      searchedAt,
    ),
  ])
  const local = localExam
    ? mergeDictionaryResults(localExam, localWordNet)
    : localWordNet
  if (
    cached?.provider === input.provider.name &&
    Date.parse(cached.expiresAt) > now
  ) {
    const parsed = input.provider.parseCachedPayload(
      cached.payload,
      cached.sourceUrl,
    )
    return publicResult(
      normalizedTerm,
      await enrichWithChinese(
        input.db,
        mergeDictionaryResults(
          {
            ...parsed,
            licenses: dictionaryLicenses(cached.licenses),
            attribution: cached.attribution,
          },
          local,
        ),
        input.translationProvider,
      ),
      'fresh',
      {
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
      },
    )
  }

  try {
    const result = await input.provider.lookup(normalizedTerm)
    const fetchedAt = new Date(now).toISOString()
    const expiresAt = new Date(now + cacheLifetimeMs).toISOString()
    await saveDictionaryCache(input.db, {
      normalizedTerm,
      provider: input.provider.name,
      payload: result.rawPayload,
      sourceUrl: result.requestUrl,
      licenses: result.licenses,
      attribution: result.attribution,
      fetchedAt,
      expiresAt,
    })
    return publicResult(
      normalizedTerm,
      await enrichWithChinese(
        input.db,
        mergeDictionaryResults(result, local),
        input.translationProvider,
      ),
      'miss',
      { fetchedAt, expiresAt },
    )
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      if (cached?.provider === input.provider.name) {
        const parsed = input.provider.parseCachedPayload(
          cached.payload,
          cached.sourceUrl,
        )
        return publicResult(
          normalizedTerm,
          await enrichWithChinese(
            input.db,
            mergeDictionaryResults(
              {
                ...parsed,
                licenses: dictionaryLicenses(cached.licenses),
                attribution: cached.attribution,
              },
              local,
            ),
            input.translationProvider,
          ),
          'stale',
          { fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          error.status === 429
            ? 'DICTIONARY_RATE_LIMITED'
            : error.code === 'EXTERNAL_TIMEOUT'
              ? 'DICTIONARY_TIMEOUT'
              : 'DICTIONARY_UNAVAILABLE',
        )
      }
      if (local) {
        return publicResult(
          normalizedTerm,
          await enrichWithChinese(input.db, local, input.translationProvider),
          'fresh',
          undefined,
          'DICTIONARY_PROVIDER_FALLBACK',
        )
      }
      throw providerError(error)
    }
    throw error
  }
}

export function normalizeSuggestionQuery(raw: string): string {
  const normalized = raw
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
  if (
    normalized.length < 1 ||
    normalized.length > 32 ||
    !/^[a-z]+(?:[' -][a-z]*)?$/.test(normalized)
  ) {
    throw new DictionaryDomainError(
      'INVALID_SUGGESTION_QUERY',
      'Suggestion text must be 1 to 32 English characters',
    )
  }
  return normalized
}

export async function getDictionarySuggestions(input: {
  db: D1Database
  profileId: string
  rawQuery: string
  provider?: { suggest(query: string, signal?: AbortSignal): Promise<string[]> }
  now?: number
}): Promise<{ suggestions: string[]; source: 'local' | 'mixed' }> {
  const query = normalizeSuggestionQuery(input.rawQuery)
  const now = input.now ?? Date.now()
  const [history, local, cachedOnline] = await Promise.all([
    listHistorySuggestions(input.db, input.profileId, query),
    listLocalLexiconSuggestions(input.db, query),
    getSuggestionCache(input.db, query, new Date(now).toISOString()),
  ])
  let online = cachedOnline ?? []
  const localCandidates = [...new Set([...history, ...local])]
  if (!cachedOnline && input.provider && localCandidates.length < 8) {
    try {
      online = await input.provider.suggest(query)
      await saveSuggestionCache(input.db, query, online, now)
    } catch {
      online = []
    }
  }
  const valid = [...history, ...local, ...online]
    .map((item) => item.normalize('NFKC').trim().toLocaleLowerCase('en'))
    .filter(
      (item) =>
        item.length <= 64 &&
        /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(item),
    )
  const suggestions = [...new Set(valid)].slice(0, 12)
  return {
    suggestions,
    source: online.length > 0 ? 'mixed' : 'local',
  }
}

export async function fetchDictionaryAudio(input: {
  rawSource: string
  range?: string
}): Promise<Response> {
  if (input.rawSource.length > 1_000) {
    throw new DictionaryDomainError(
      'INVALID_AUDIO_SOURCE',
      'Audio source is invalid',
    )
  }
  const source = validatedDictionaryAudioUrl(input.rawSource)
  if (!source) {
    throw new DictionaryDomainError(
      'INVALID_AUDIO_SOURCE',
      'Audio source is invalid',
    )
  }
  const headers = new Headers({ accept: 'audio/*' })
  if (input.range && /^bytes=\d*-\d*$/.test(input.range)) {
    headers.set('range', input.range)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), 5_000)
  let response: Response
  try {
    response = await fetch(source, { headers, signal: controller.signal })
  } catch {
    throw new DictionaryDomainError(
      'DICTIONARY_AUDIO_UNAVAILABLE',
      'Pronunciation audio is temporarily unavailable',
      502,
    )
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok || !response.body) {
    throw new DictionaryDomainError(
      'DICTIONARY_AUDIO_UNAVAILABLE',
      'Pronunciation audio is temporarily unavailable',
      response.status === 404 ? 404 : 502,
    )
  }
  const contentType = response.headers.get('content-type') ?? ''
  const contentLength = Number(response.headers.get('content-length'))
  if (
    !contentType.toLowerCase().startsWith('audio/') ||
    (Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024)
  ) {
    throw new DictionaryDomainError(
      'DICTIONARY_AUDIO_INVALID',
      'Pronunciation audio response is invalid',
      502,
    )
  }
  const outputHeaders = new Headers({
    'cache-control': 'public, max-age=86400',
    'content-type': contentType,
    'cross-origin-resource-policy': 'same-origin',
    'x-content-type-options': 'nosniff',
  })
  for (const name of ['accept-ranges', 'content-length', 'content-range']) {
    const value = response.headers.get(name)
    if (value) outputHeaders.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    headers: outputHeaders,
  })
}

export function dictionaryLicenses(value: unknown): DictionaryLicense[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is DictionaryLicense => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return false
    }
    const record = item as Record<string, unknown>
    return typeof record.name === 'string'
  })
}

export async function getDictionaryHistory(db: D1Database, profileId: string) {
  return listDictionaryHistory(db, profileId)
}

const examDictionarySlugs = new Set([
  'cet4',
  'cet6',
  'postgrad',
  'pets5',
  'tem4',
  'tem8',
  'ielts',
  'toefl',
  'gre',
  'sat',
  'gmat',
  'awl',
])

export async function getExamDictionaryCatalog(db: D1Database) {
  return { lists: await listExamDictionaries(db) }
}

export async function browseExamDictionary(input: {
  db: D1Database
  rawSlug: string
  rawLetter: string
  rawCursor?: string
  rawLimit?: string
}) {
  const slug = input.rawSlug.normalize('NFKC').trim().toLowerCase()
  if (!examDictionarySlugs.has(slug)) {
    throw new DictionaryDomainError(
      'EXAM_DICTIONARY_NOT_FOUND',
      'Exam dictionary was not found',
      404,
    )
  }
  const letter = input.rawLetter.normalize('NFKC').trim().toUpperCase()
  if (!/^[A-Z]$/.test(letter)) {
    throw new DictionaryDomainError(
      'INVALID_EXAM_DICTIONARY_LETTER',
      'Letter must be A to Z',
    )
  }
  let cursor: string | undefined
  if (input.rawCursor) {
    cursor = normalizeDictionaryTerm(input.rawCursor)
    if (!cursor.startsWith(letter.toLowerCase())) {
      throw new DictionaryDomainError(
        'INVALID_EXAM_DICTIONARY_CURSOR',
        'Cursor does not belong to the selected letter',
      )
    }
  }
  const parsedLimit = input.rawLimit ? Number(input.rawLimit) : 50
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new DictionaryDomainError(
      'INVALID_EXAM_DICTIONARY_LIMIT',
      'Limit must be an integer from 1 to 100',
    )
  }
  const list = await getExamDictionaryList(input.db, slug)
  if (!list) {
    throw new DictionaryDomainError(
      'EXAM_DICTIONARY_NOT_FOUND',
      'Exam dictionary was not found',
      404,
    )
  }
  const page = await listExamDictionaryWords({
    db: input.db,
    slug,
    letter,
    cursor,
    limit: parsedLimit,
  })
  return {
    list,
    letter,
    letterEntryCount: list.letterCounts[letter] ?? 0,
    ...page,
  }
}

export async function addDictionaryTerm(input: {
  db: D1Database
  profileId: string
  rawTerm: string
  provider: string
  destination: 'favorite' | 'review'
}) {
  const normalizedTerm = normalizeDictionaryTerm(input.rawTerm)
  await saveDictionaryTerm({
    db: input.db,
    table:
      input.destination === 'favorite'
        ? 'dictionary_favorites'
        : 'vocabulary_review_queue',
    profileId: input.profileId,
    normalizedTerm,
    provider: input.provider,
  })
  return { normalizedTerm, destination: input.destination, saved: true }
}
