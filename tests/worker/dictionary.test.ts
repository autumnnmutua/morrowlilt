import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExternalServiceError } from '../../worker/http/fetch-json'
import type {
  DictionaryProvider,
  DictionaryProviderResult,
  DictionaryTranslationProvider,
} from '../../worker/providers/contracts'
import { FreeDictionaryProvider } from '../../worker/providers/free-dictionary'
import {
  buildInflections,
  irregularVerbCount,
} from '../../worker/dictionary/morphology'
import { getDictionaryCache } from '../../worker/repository/dictionary'
import {
  addDictionaryTerm,
  DictionaryDomainError,
  getDictionaryHistory,
  getDictionarySuggestions,
  lookupDictionary,
  normalizeDictionaryTerm,
} from '../../worker/services/dictionary'
import { ensureAppProfile } from '../../worker/services/learning'

const fixture = [
  {
    word: 'resilient',
    phonetic: '/rɪˈzɪliənt/',
    phonetics: [
      {
        text: '/rɪˈzɪliənt/',
        audio: 'https://audio.example.invalid/resilient.mp3',
        sourceUrl: 'https://source.example.invalid/audio',
        license: {
          name: 'BY-SA 4.0',
          url: 'https://creativecommons.org/licenses/by-sa/4.0',
        },
      },
    ],
    forms: ['resilience', 'resiliently'],
    meanings: [
      {
        partOfSpeech: 'adjective',
        synonyms: ['robust'],
        antonyms: ['fragile'],
        definitions: [
          {
            definition:
              '<img src=x onerror=alert(1)>Able to recover after difficulty.',
            example: '<b>The community remained resilient.</b>',
            synonyms: ['adaptable'],
            antonyms: ['vulnerable'],
          },
          {
            definition: 'Returning to an original shape after bending.',
            synonyms: [],
            antonyms: [],
          },
        ],
      },
      {
        partOfSpeech: 'noun',
        definitions: [
          {
            definition: 'A resilient person.',
            synonyms: [],
            antonyms: [],
          },
        ],
        synonyms: [],
        antonyms: [],
      },
    ],
    license: {
      name: 'CC BY-SA 3.0',
      url: 'https://creativecommons.org/licenses/by-sa/3.0',
    },
    sourceUrls: ['https://en.wiktionary.org/wiki/resilient'],
  },
  {
    word: 'resilient',
    meanings: [
      {
        partOfSpeech: 'adjective',
        definitions: [
          {
            definition: 'Capable of resisting shock.',
            synonyms: ['durable'],
            antonyms: [],
          },
        ],
        synonyms: [],
        antonyms: [],
      },
    ],
    license: { name: 'CC BY-SA 3.0' },
    sourceUrls: ['https://en.wiktionary.org/wiki/resilient'],
  },
]

async function profile(label: string): Promise<string> {
  const profileId = `${label}-${crypto.randomUUID()}`
  await ensureAppProfile({
    db: env.DB,
    profileId,
    timeZone: 'Asia/Shanghai',
    now: Date.parse('2026-08-20T04:00:00.000Z'),
  })
  return profileId
}

class SequenceDictionaryProvider implements DictionaryProvider {
  readonly name = 'test-dictionary-provider'
  calls = 0
  error: ExternalServiceError | undefined
  private readonly parser = new FreeDictionaryProvider()

  lookup(term: string): Promise<DictionaryProviderResult> {
    this.calls += 1
    if (this.error) return Promise.reject(this.error)
    return Promise.resolve(
      this.parser.parseCachedPayload(
        structuredClone(fixture),
        `https://provider.example.invalid/${encodeURIComponent(term)}`,
      ),
    )
  }

  parseCachedPayload(
    payload: unknown,
    requestUrl: string,
  ): DictionaryProviderResult {
    return this.parser.parseCachedPayload(payload, requestUrl)
  }
}

class RecordingTranslationProvider implements DictionaryTranslationProvider {
  readonly name = 'test-translation-provider'
  calls: string[][] = []

  translateMany(texts: string[]) {
    this.calls.push(texts)
    return Promise.resolve(
      texts.map((text, index) => ({
        translatedText: `中文释义 ${index + 1}：${text.length} 个字符`,
        attribution: '测试中文翻译',
      })),
    )
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Free Dictionary Provider', () => {
  it('ships the expanded irregular verb morphology bank', () => {
    expect(irregularVerbCount).toBe(84)
  })
  it('URL-encodes normalized phrases and preserves every entry, POS, sense, and source', async () => {
    let requestedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        requestedUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        return Promise.resolve(Response.json(fixture))
      }),
    )
    const provider = new FreeDictionaryProvider(
      'https://provider.example.invalid/entries/en',
    )
    const result = await provider.lookup('take off')

    expect(requestedUrl).toBe(
      'https://provider.example.invalid/entries/en/take%20off',
    )
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].partsOfSpeech).toHaveLength(2)
    expect(result.entries[0].partsOfSpeech[0].senses).toHaveLength(2)
    expect(result.entries[0].partsOfSpeech[0].senses[1].examples).toEqual([])
    expect(result.entries[0].sourceUrls).toEqual([
      'https://en.wiktionary.org/wiki/resilient',
    ])
    expect(result.entries[0].license).toMatchObject({ name: 'CC BY-SA 3.0' })
    expect(JSON.stringify(result.entries)).not.toMatch(/<img|<b|onerror/i)
  })

  it('surfaces 404 and retries then preserves a 429 response', async () => {
    const provider = new FreeDictionaryProvider(
      'https://provider.example.invalid/entries/en',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
    )
    await expect(provider.lookup('missing')).rejects.toMatchObject({
      code: 'EXTERNAL_HTTP_ERROR',
      status: 404,
      retryable: false,
    })

    const rateLimitedFetch = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 429 })),
    )
    vi.stubGlobal('fetch', rateLimitedFetch)
    await expect(provider.lookup('busy')).rejects.toMatchObject({
      status: 429,
      retryable: true,
    })
    expect(rateLimitedFetch).toHaveBeenCalledTimes(2)
  })

  it('aborts a provider request after the configured timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          }),
      ),
    )
    const provider = new FreeDictionaryProvider(
      'https://provider.example.invalid/entries/en',
      10,
    )
    await expect(provider.lookup('slow')).rejects.toMatchObject({
      code: 'EXTERNAL_TIMEOUT',
    })
  })
})

describe('dictionary normalization, D1 cache, and saved terms', () => {
  it('normalizes Unicode/case and rejects long or non-English input before history storage', () => {
    expect(normalizeDictionaryTerm('  ＲＥＳＩＬＩＥＮＴ  ')).toBe('resilient')
    expect(normalizeDictionaryTerm('Mother’s-in-Law')).toBe("mother's-in-law")
    expect(() => normalizeDictionaryTerm('<script>alert(1)</script>')).toThrow(
      DictionaryDomainError,
    )
    expect(() => normalizeDictionaryTerm('a'.repeat(65))).toThrow(
      DictionaryDomainError,
    )
  })

  it('writes raw payload and attribution, then hits fresh cache without another fetch', async () => {
    const profileId = await profile('dictionary-cache-hit')
    const provider = new SequenceDictionaryProvider()
    const now = Date.parse('2026-08-20T08:00:00.000Z')
    const first = await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'ResilientCache',
      now,
    })
    const second = await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'resilientcache',
      now: now + 60_000,
    })

    expect(first.cacheStatus).toBe('miss')
    expect(second.cacheStatus).toBe('fresh')
    expect(provider.calls).toBe(1)
    const cached = await getDictionaryCache(env.DB, 'resilientcache')
    expect(cached).toMatchObject({
      provider: 'test-dictionary-provider',
      sourceUrl: 'https://provider.example.invalid/resilientcache',
    })
    expect(cached?.payload).toEqual(fixture)
    expect(cached?.attribution).toContain('Free Dictionary API')
    expect(second.licenses).toContainEqual(
      expect.objectContaining({ name: 'CC BY-SA 3.0' }),
    )

    const history = await getDictionaryHistory(env.DB, profileId)
    expect(history).toEqual([
      expect.objectContaining({ term: 'resilientcache', searchCount: 2 }),
    ])
    const columns = await env.DB.prepare(
      `SELECT name FROM pragma_table_info('dictionary_search_history')`,
    ).all<{ name: string }>()
    expect(columns.results.map((column) => column.name)).not.toContain(
      'raw_term',
    )
  })

  it('adds Chinese to every Provider sense and example without truncating entries', async () => {
    const provider = new SequenceDictionaryProvider()
    const translationProvider = new RecordingTranslationProvider()
    const result = await lookupDictionary({
      db: env.DB,
      profileId: await profile('dictionary-complete-chinese'),
      provider,
      translationProvider,
      rawTerm: 'resilientzh',
    })

    const senses = result.entries.flatMap((entry) =>
      entry.partsOfSpeech.flatMap((part) => part.senses),
    )
    expect(result.entries).toHaveLength(2)
    expect(senses).toHaveLength(4)
    expect(translationProvider.calls.flat()).toHaveLength(5)
    expect(senses.every((sense) => sense.translatedDefinition)).toBe(true)
    expect(
      senses
        .flatMap((sense) => sense.examples)
        .every((item) => item.translation),
    ).toBe(true)

    await lookupDictionary({
      db: env.DB,
      profileId: await profile('dictionary-cached-chinese'),
      provider,
      translationProvider,
      rawTerm: 'resilientzh',
    })
    expect(translationProvider.calls).toHaveLength(1)
  })

  it('labels common and irregular verb forms and noun plurals', () => {
    expect(buildInflections('run', ['verb'])).toEqual(
      expect.arrayContaining([
        { form: 'runs', label: '第三人称单数' },
        { form: 'running', label: '现在分词 / 动名词' },
        { form: 'ran', label: '过去式' },
        { form: 'run', label: '过去分词' },
      ]),
    )
    expect(buildInflections('study', ['noun', 'verb'])).toEqual(
      expect.arrayContaining([
        { form: 'studies', label: '第三人称单数' },
        { form: 'studied', label: '过去式' },
        { form: 'studies', label: '复数' },
      ]),
    )
  })

  it('falls back to local WordNet and combines local and online suggestions', async () => {
    await env.DB.prepare(
      `INSERT INTO dictionary_lexicon_senses (
         normalized_lemma, lemma, part_of_speech, definition,
         examples_json, synonyms_json, source_synset_id
       ) VALUES (?, ?, 'adjective', ?, ?, ?, ?)`,
    )
      .bind(
        'resilientlocal',
        'resilientlocal',
        'able to recover from difficulty',
        JSON.stringify(['The community proved resilient.']),
        JSON.stringify(['adaptable', 'robust']),
        'test-local-fallback',
      )
      .run()
    const provider = new SequenceDictionaryProvider()
    provider.error = new ExternalServiceError(
      'EXTERNAL_HTTP_ERROR',
      'missing',
      false,
      404,
    )
    const profileId = await profile('dictionary-local-fallback')
    const result = await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'resilientlocal',
    })
    expect(result).toMatchObject({
      warningCode: 'DICTIONARY_PROVIDER_FALLBACK',
      entries: [
        expect.objectContaining({
          headword: 'resilientlocal',
          partsOfSpeech: [expect.objectContaining({ label: 'adjective' })],
        }),
      ],
    })

    const suggestions = await getDictionarySuggestions({
      db: env.DB,
      profileId,
      rawQuery: 'resi',
      provider: {
        suggest: () => Promise.resolve(['resilience', 'resilient']),
      },
    })
    expect(suggestions.suggestions).toEqual(
      expect.arrayContaining(['resilientlocal', 'resilience', 'resilient']),
    )
  })

  it('refreshes expired cache and uses stale cache during 429 or timeout', async () => {
    const profileId = await profile('dictionary-cache-expiry')
    const provider = new SequenceDictionaryProvider()
    const now = Date.parse('2026-08-20T08:00:00.000Z')
    await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'resilientexpiry',
      now,
    })
    const refreshed = await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'resilientexpiry',
      now: now + 8 * 24 * 60 * 60 * 1_000,
    })
    expect(refreshed.cacheStatus).toBe('miss')
    expect(provider.calls).toBe(2)

    provider.error = new ExternalServiceError(
      'EXTERNAL_HTTP_ERROR',
      'rate limited',
      true,
      429,
    )
    const stale = await lookupDictionary({
      db: env.DB,
      profileId,
      provider,
      rawTerm: 'resilientexpiry',
      now: now + 16 * 24 * 60 * 60 * 1_000,
    })
    expect(stale).toMatchObject({
      cacheStatus: 'stale',
      warningCode: 'DICTIONARY_RATE_LIMITED',
    })
  })

  it.each([
    [
      new ExternalServiceError('EXTERNAL_HTTP_ERROR', 'missing', false, 404),
      'DICTIONARY_NOT_FOUND',
      404,
    ],
    [
      new ExternalServiceError(
        'EXTERNAL_HTTP_ERROR',
        'rate limited',
        true,
        429,
      ),
      'DICTIONARY_RATE_LIMITED',
      503,
    ],
    [
      new ExternalServiceError('EXTERNAL_TIMEOUT', 'timeout', true),
      'DICTIONARY_TIMEOUT',
      504,
    ],
  ])('maps Provider errors without a cache', async (error, code, status) => {
    const provider = new SequenceDictionaryProvider()
    provider.error = error
    await expect(
      lookupDictionary({
        db: env.DB,
        profileId: await profile(`dictionary-error-${code}`),
        provider,
        rawTerm: 'missingword',
      }),
    ).rejects.toMatchObject({ code, status })
  })

  it('adds a normalized term idempotently to favorites and the review queue', async () => {
    const profileId = await profile('dictionary-saved-terms')
    for (const destination of ['favorite', 'review'] as const) {
      await addDictionaryTerm({
        db: env.DB,
        profileId,
        rawTerm: ' Resilient ',
        provider: 'test-dictionary-provider',
        destination,
      })
      await addDictionaryTerm({
        db: env.DB,
        profileId,
        rawTerm: 'resilient',
        provider: 'test-dictionary-provider',
        destination,
      })
    }
    const favoriteCount = await env.DB.prepare(
      'SELECT count(*) AS count FROM dictionary_favorites WHERE profile_id = ?',
    )
      .bind(profileId)
      .first<{ count: number }>()
    const reviewCount = await env.DB.prepare(
      'SELECT count(*) AS count FROM vocabulary_review_queue WHERE profile_id = ?',
    )
      .bind(profileId)
      .first<{ count: number }>()
    expect(favoriteCount?.count).toBe(1)
    expect(reviewCount?.count).toBe(1)
  })

  it('keeps third-party calls behind the Worker API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(fixture))),
    )
    const response = await exports.default.fetch(
      new Request('https://example.invalid/api/dictionary?term=resilient'),
    )
    expect(response.status).toBe(200)
    const body = await response.json<{ data: { entries: unknown[] } }>()
    expect(body.data.entries).toHaveLength(2)
    expect(JSON.stringify(body)).not.toContain('rawPayload')
  })
})
