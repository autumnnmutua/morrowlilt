import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeContentFingerprint } from '../../worker/content/fingerprint'
import { practicalExpressionCount } from '../../worker/content/practical-expressions'
import {
  ContentValidationError,
  isDailyContentCandidate,
  validateAndSanitizeDailyContentCandidate,
} from '../../worker/content/schema'
import {
  createSeedCandidates,
  seedThemeCoverage,
} from '../../worker/content/seeds'
import { renderDailyEmail } from '../../worker/email/render'
import {
  ExternalServiceError,
  fetchJsonWithPolicy,
} from '../../worker/http/fetch-json'
import type {
  ContentGenerationContext,
  ContentProvider,
  DailyContentCandidate,
} from '../../worker/providers/contracts'
import {
  getDailyContent,
  insertDailyContent,
} from '../../worker/repository/daily-content'
import { ensureDailyContent } from '../../worker/services/daily-content'
import { enrichDailyContentsVocabulary } from '../../worker/services/vocabulary-enrichment'

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM daily_content_revision_audit'),
    env.DB.prepare('DELETE FROM daily_content_components'),
    env.DB.prepare('DELETE FROM daily_learning_packages'),
    env.DB.prepare('DELETE FROM daily_topics'),
    env.DB.prepare('DELETE FROM daily_content'),
  ])
})

function onlineCandidate(
  contentDate: string,
  seedIndex = 0,
): DailyContentCandidate {
  const candidate = structuredClone(
    createSeedCandidates(contentDate)[seedIndex],
  )
  candidate.provider = 'test-online-provider'
  candidate.attribution = '测试学习内容'
  candidate.payload.originType = 'ai_assisted'
  candidate.payload.generatorVersion = 'test-online-v2'
  return candidate
}

function distinctOnlineCandidate(contentDate: string): DailyContentCandidate {
  const candidate = onlineCandidate(contentDate, 0)
  candidate.payload.sentence.english =
    'When researchers combine fragmented archival records with transparent uncertainty estimates, they can reconstruct plausible histories without presenting speculation as established fact.'
  candidate.payload.sentence.chinese =
    '当研究者把零散档案与透明的不确定性估计结合起来时，他们可以重建合理的历史，同时避免把推测说成既定事实。'
  candidate.payload.vocabulary = [
    {
      kind: 'word',
      term: 'corroborate',
      partOfSpeech: '动词',
      definition: 'to support a claim with independent evidence',
      definitionZh: '用独立证据证实某项说法',
      example: 'Several independent records corroborate the witness account.',
      exampleZh: '多份独立记录证实了证人的说法。',
      usageNote: '常与 evidence、account 或 claim 搭配。',
    },
    {
      kind: 'phrase',
      term: 'epistemic caution',
      partOfSpeech: '名词短语',
      definition: 'care in judging what can genuinely be known',
      definitionZh: '判断哪些知识真正可靠时所保持的审慎',
      example:
        'Epistemic caution is essential when the surviving evidence is incomplete.',
      exampleZh: '当留存证据不完整时，认识上的审慎至关重要。',
      usageNote: '用于研究证据和知识边界的讨论。',
    },
    {
      kind: 'expression',
      term: 'provisional conclusion',
      partOfSpeech: '名词短语',
      definition: 'a conclusion that may change when new evidence appears',
      definitionZh: '可能因新证据出现而调整的暂定结论',
      example:
        'The team published a provisional conclusion rather than a definitive claim.',
      exampleZh: '团队发布了暂定结论，而不是最终断言。',
      usageNote: '强调结论仍可根据后续证据修订。',
    },
  ]
  candidate.payload.topic.prompt =
    'Researchers should publish uncertain findings before all available evidence has been collected. Discuss the benefits and risks.'
  return candidate
}

it('enriches daily vocabulary with every local part of speech using compact labels', async () => {
  const normalizedWord = `dailyword${crypto.randomUUID().replaceAll('-', '')}`
  await env.DB.prepare(
    `INSERT INTO dictionary_exam_lexemes
       (normalized_word, display_word, phonetic, english_definition,
        chinese_translation, parts_of_speech, exchange, source_name,
        source_url, source_license, updated_at)
       VALUES (?, ?, 'test', ?, ?, 'adj:25/n:25/vt:25/vi:25', '',
               'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT',
               CURRENT_TIMESTAMP)`,
  )
    .bind(
      normalizedWord,
      normalizedWord,
      'adj. accessible\nn. an accessible place\nvt. to make accessible\nvi. to become accessible',
      'adj.便利可达的；易于理解的\nn.可进入的场所\nvt.使……可使用\nvi.变得可访问',
    )
    .run()
  const content = await ensureDailyContent({
    db: env.DB,
    contentDate: '2026-09-29',
    timeZone: 'Asia/Shanghai',
  })
  const fixture = {
    ...content,
    payload: {
      ...content.payload,
      vocabulary: content.payload.vocabulary.map((item, index) =>
        index === 0
          ? {
              ...item,
              term: normalizedWord,
              partOfSpeech: 'adj.',
              definitionZh: '便利可达的；易于理解的',
            }
          : item,
      ),
    },
  }

  const [enriched] = await enrichDailyContentsVocabulary(env.DB, [fixture])
  expect(enriched.payload.vocabulary[0].meaningGroups).toEqual([
    { partOfSpeech: 'adj.', meaningsZh: ['便利可达的；易于理解的'] },
    { partOfSpeech: 'n.', meaningsZh: ['可进入的场所'] },
    { partOfSpeech: 'vt.', meaningsZh: ['使……可使用'] },
    { partOfSpeech: 'vi.', meaningsZh: ['变得可访问'] },
  ])
  expect(
    enriched.payload.vocabulary
      .slice(1)
      .every(
        (item) =>
          item.meaningGroups?.length &&
          item.meaningGroups.every((group) =>
            /^(?:n|v|vt|vi|adj|adv|aux|pron|prep|conj|phr|expr|word)\.$/.test(
              group.partOfSpeech,
            ),
          ),
      ),
  ).toBe(true)
})

class SequenceProvider implements ContentProvider {
  readonly name = 'test-online-provider'
  calls = 0
  private readonly factory: (
    contentDate: string,
    context: ContentGenerationContext,
  ) => DailyContentCandidate | Promise<DailyContentCandidate>

  constructor(
    factory: (
      contentDate: string,
      context: ContentGenerationContext,
    ) => DailyContentCandidate | Promise<DailyContentCandidate>,
  ) {
    this.factory = factory
  }

  async generateDailyContent(
    contentDate: string,
    _timeZone: string,
    context: ContentGenerationContext = {
      attempt: 1,
      recentFingerprints: [],
      regeneration: false,
    },
  ): Promise<DailyContentCandidate> {
    this.calls += 1
    return this.factory(contentDate, context)
  }
}

class FailingProvider implements ContentProvider {
  readonly name: string
  private readonly error: Error

  constructor(name: string, error: Error) {
    this.name = name
    this.error = error
  }

  generateDailyContent(): Promise<DailyContentCandidate> {
    return Promise.reject(this.error)
  }
}

describe('daily-content schema and seeds', () => {
  it('covers every required high-level theme with complete C1 content', () => {
    expect(new Set(seedThemeCoverage)).toEqual(
      new Set([
        'learning',
        'campus',
        'technology',
        'environment',
        'work',
        'health',
        'city',
        'culture',
      ]),
    )
    const candidates = createSeedCandidates('2026-09-01')
    expect(candidates).toHaveLength(12)
    expect(practicalExpressionCount).toBe(36)
    for (const candidate of candidates) {
      expect(isDailyContentCandidate(candidate)).toBe(true)
      expect(candidate.payload).toMatchObject({
        schemaVersion: 2,
        difficulty: 'C1',
        originType: 'original',
      })
      expect(candidate.payload.vocabulary.length).toBeGreaterThanOrEqual(3)
      expect(candidate.payload.topic.prompt.length).toBeGreaterThan(20)
    }
  })

  it('removes HTML/XSS while rejecting forbidden secret-like fields', () => {
    const raw = onlineCandidate('2026-09-02')
    raw.payload.sentence.english =
      '<img src=x onerror=alert(1)> ' + raw.payload.sentence.english
    raw.payload.sentence.chinese =
      '<script>alert(1)</script> ' + raw.payload.sentence.chinese
    const sanitized = validateAndSanitizeDailyContentCandidate(
      raw,
      '2026-09-02',
      'safe-provider-name',
    )
    expect(JSON.stringify(sanitized)).not.toMatch(/<img|<script|onerror/i)
    expect(sanitized.provider).toBe('safe-provider-name')

    const forbidden: unknown = {
      ...onlineCandidate('2026-09-02'),
      apiKey: 'not-allowed',
    }
    expect(() =>
      validateAndSanitizeDailyContentCandidate(forbidden, '2026-09-02'),
    ).toThrowError(ContentValidationError)
  })

  it('strips private URL parameters instead of exposing them as attribution', () => {
    const raw = onlineCandidate('2026-09-02')
    raw.payload.originType = 'licensed'
    raw.attribution = 'Licensed editorial learning material'
    raw.sourceUrl = 'https://source.invalid/article?temporary=value#section'
    const candidate = validateAndSanitizeDailyContentCandidate(
      raw,
      '2026-09-02',
    )
    expect(candidate.sourceUrl).toBe('https://source.invalid/article')
  })

  it('classifies malformed Provider JSON before schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    try {
      await expect(
        fetchJsonWithPolicy(
          'https://provider.invalid/content',
          { method: 'POST' },
          {
            operation: 'test.invalid_json',
            maxAttempts: 1,
            validate: (value): value is Record<string, unknown> =>
              typeof value === 'object' && value !== null,
          },
        ),
      ).rejects.toMatchObject({ code: 'EXTERNAL_INVALID_JSON' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('daily-content generation pipeline', () => {
  it('keeps the first same-day snapshot immutable across repeated requests', async () => {
    const provider = new SequenceProvider((date, context) =>
      onlineCandidate(date, context.attempt % 2),
    )
    const first = await ensureDailyContent({
      db: env.DB,
      contentDate: '2026-09-03',
      timeZone: 'Asia/Shanghai',
      onlineProvider: provider,
    })
    const second = await ensureDailyContent({
      db: env.DB,
      contentDate: '2026-09-03',
      timeZone: 'Asia/Shanghai',
      onlineProvider: provider,
    })

    expect(second.id).toBe(first.id)
    expect(second.contentHash).toBe(first.contentHash)
    expect(provider.calls).toBe(1)
  })

  it('creates different fingerprints and email bodies across business days', async () => {
    const first = await ensureDailyContent({
      db: env.DB,
      contentDate: '2026-09-04',
      timeZone: 'Asia/Shanghai',
    })
    const second = await ensureDailyContent({
      db: env.DB,
      contentDate: '2026-09-05',
      timeZone: 'Asia/Shanghai',
    })

    expect(second.fingerprint).not.toBe(first.fingerprint)
    expect(second.payload.sentence.english).not.toBe(
      first.payload.sentence.english,
    )
    expect(renderDailyEmail(second).text).not.toBe(renderDailyEmail(first).text)
  })

  it.each([
    [
      'provider timeout',
      new ExternalServiceError('EXTERNAL_TIMEOUT', 'timed out', true),
    ],
    [
      'invalid JSON',
      new ExternalServiceError('EXTERNAL_INVALID_JSON', 'invalid JSON', false),
    ],
  ])('falls back to a seed after %s', async (_label, error) => {
    const contentDate =
      error.code === 'EXTERNAL_TIMEOUT' ? '2026-09-06' : '2026-09-07'
    const content = await ensureDailyContent({
      db: env.DB,
      contentDate,
      timeZone: 'Asia/Shanghai',
      onlineProvider: new FailingProvider('failing-provider', error),
    })
    expect(content.source).toBe('seed')
    expect(content.originType).toBe('original')
  })

  it('retries recently duplicated online content then falls back', async () => {
    const firstDate = '2026-09-08'
    const secondDate = '2026-09-09'
    const firstCandidate = distinctOnlineCandidate(firstDate)
    await ensureDailyContent({
      db: env.DB,
      contentDate: firstDate,
      timeZone: 'Asia/Shanghai',
      onlineProvider: new SequenceProvider(() => firstCandidate),
    })
    const duplicateProvider = new SequenceProvider(() => ({
      ...structuredClone(firstCandidate),
      payload: {
        ...structuredClone(firstCandidate.payload),
        contentDate: secondDate,
      },
    }))
    const second = await ensureDailyContent({
      db: env.DB,
      contentDate: secondDate,
      timeZone: 'Asia/Shanghai',
      onlineProvider: duplicateProvider,
    })

    expect(duplicateProvider.calls).toBe(2)
    expect(second.source).toBe('seed')
    expect(second.fingerprint).not.toBe(
      await computeContentFingerprint(firstCandidate.payload),
    )
  })

  it('sanitizes valid online content before it reaches D1', async () => {
    const provider = new SequenceProvider((date) => {
      const candidate = onlineCandidate(date, 5)
      candidate.payload.sentence.english =
        '<b>Accessible</b> Coastal wetlands can moderate storm surges, filter urban runoff, and sustain diverse habitats when restoration projects respect the movement of water across an entire estuary.'
      candidate.payload.sentence.chinese =
        '沿海湿地能够缓和风暴潮、过滤城市径流并维持多样化栖息地，前提是修复项目尊重整个河口区域的水体流动。'
      candidate.payload.vocabulary = [
        {
          kind: 'word',
          term: 'estuary',
          partOfSpeech: '名词',
          definition: 'the tidal area where a river meets the sea',
          definitionZh: '河流入海处受潮汐影响的河口区域',
          example: 'The estuary supports fish nurseries and migratory birds.',
          exampleZh: '这片河口为幼鱼和候鸟提供栖息地。',
          usageNote: '用于海岸生态和地理语境。',
        },
        {
          kind: 'phrase',
          term: 'moderate a surge',
          partOfSpeech: '动词短语',
          definition: 'to reduce the force of a sudden rise in water',
          definitionZh: '减弱水位突然上涨所带来的冲击',
          example:
            'Restored marshes can moderate a surge before it reaches homes.',
          exampleZh: '修复后的湿地能在洪峰抵达住宅前削弱其冲击。',
          usageNote: 'moderate 在这里作动词，表示降低强度。',
        },
        {
          kind: 'expression',
          term: 'ecological buffer',
          partOfSpeech: '名词短语',
          definition: 'a natural area that reduces environmental pressure',
          definitionZh: '能够减轻环境压力的自然缓冲区域',
          example: 'The wetland acts as an ecological buffer around the city.',
          exampleZh: '这片湿地充当城市周边的生态缓冲带。',
          usageNote: '常用于城市规划和生态保护讨论。',
        },
      ]
      candidate.payload.practicalExpressions =
        candidate.payload.practicalExpressions?.map((item, index) => ({
          ...item,
          expression: `Fresh coastal expression ${index + 1}.`,
        }))
      candidate.payload.topic.prompt =
        'Cities should restore coastal wetlands even when doing so restricts profitable waterfront development. Discuss both views.'
      return candidate
    })
    const stored = await ensureDailyContent({
      db: env.DB,
      contentDate: '2026-09-10',
      timeZone: 'Asia/Shanghai',
      onlineProvider: provider,
    })
    expect(stored.source).toBe('online')
    expect(stored.payload.sentence.english).not.toContain('<b>')
    expect((await getDailyContent(env.DB, '2026-09-10'))?.contentHash).toBe(
      stored.contentHash,
    )
  })
})

describe('administrator content APIs', () => {
  const adminFixture = ['local', 'admin', 'fixture'].join('-')
  const authorization = { authorization: `Bearer ${adminFixture}` }

  it('requires authorization and previews without persisting', async () => {
    const unauthorized = await exports.default.fetch(
      new Request('https://example.invalid/api/admin/daily-content/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: '2026-09-11' }),
      }),
    )
    expect(unauthorized.status).toBe(401)

    const preview = await exports.default.fetch(
      new Request('https://example.invalid/api/admin/daily-content/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authorization },
        body: JSON.stringify({ date: '2026-09-11' }),
      }),
    )
    expect(preview.status).toBe(200)
    expect(await getDailyContent(env.DB, '2026-09-11')).toBeUndefined()
    expect(JSON.stringify(await preview.json())).not.toContain(adminFixture)
  })

  it('regenerates explicitly and keeps exactly one audit for an idempotent retry', async () => {
    const contentDate = '2026-09-12'
    await ensureDailyContent({
      db: env.DB,
      contentDate,
      timeZone: 'Asia/Shanghai',
    })
    const original = await getDailyContent(env.DB, contentDate)
    const request = () =>
      new Request(
        'https://example.invalid/api/admin/daily-content/regenerate',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'admin-regenerate-20260912',
            ...authorization,
          },
          body: JSON.stringify({
            date: contentDate,
            reason: 'Replace the snapshot after an editorial quality review.',
          }),
        },
      )
    const first = await exports.default.fetch(request())
    const second = await exports.default.fetch(request())
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const regenerated = await getDailyContent(env.DB, contentDate)
    expect(regenerated?.id).toBe(original?.id)
    expect(regenerated?.fingerprint).not.toBe(original?.fingerprint)
    const audit = await env.DB.prepare(
      `SELECT count(*) AS count FROM daily_content_revision_audit
       WHERE content_date = ?`,
    )
      .bind(contentDate)
      .first<{ count: number }>()
    expect(audit?.count).toBe(1)
  })
})

describe('lifetime component uniqueness', () => {
  it('rejects an exact sentence, vocabulary term or practical expression replay', async () => {
    const firstDate = '2026-10-01'
    const first = onlineCandidate(firstDate, 0)
    await insertDailyContent(env.DB, {
      contentDate: firstDate,
      candidate: first,
      source: 'online',
    })
    const replay = structuredClone(first)
    replay.payload.contentDate = '2027-10-01'

    await expect(
      insertDailyContent(env.DB, {
        contentDate: replay.payload.contentDate,
        candidate: replay,
        source: 'online',
      }),
    ).rejects.toThrow()

    const componentCount = await env.DB.prepare(
      'SELECT count(*) AS count FROM daily_content_components',
    ).first<{ count: number }>()
    expect(componentCount?.count).toBe(7)
  })
})
