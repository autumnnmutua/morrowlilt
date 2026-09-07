import { validateAndSanitizeDailyContentCandidate } from '../content/schema'
import type {
  ContentGenerationContext,
  ContentProvider,
  DailyContentCandidate,
  DailyContentPayload,
  DictionaryTranslationProvider,
} from './contracts'

const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as const
const translationModel = '@cf/meta/m2m100-1.2b' as const

export const compactDailyContentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    theme: {
      enum: [
        'learning',
        'campus',
        'technology',
        'environment',
        'work',
        'health',
        'city',
        'culture',
      ],
    },
    sentence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        english: { type: 'string', minLength: 40, maxLength: 240 },
        chinese: { type: 'string', minLength: 12, maxLength: 240 },
        grammarNote: { type: 'string', minLength: 4, maxLength: 160 },
        usageNote: { type: 'string', minLength: 4, maxLength: 160 },
        microExercise: { type: 'string', minLength: 12, maxLength: 240 },
      },
      required: [
        'english',
        'chinese',
        'grammarNote',
        'usageNote',
        'microExercise',
      ],
    },
    vocabulary: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { enum: ['word', 'phrase', 'expression'] },
          term: { type: 'string', minLength: 2, maxLength: 80 },
          partOfSpeech: { type: 'string', minLength: 2, maxLength: 60 },
          definition: { type: 'string', minLength: 4, maxLength: 180 },
          definitionZh: { type: 'string', minLength: 2, maxLength: 100 },
          example: { type: 'string', minLength: 12, maxLength: 220 },
          exampleZh: { type: 'string', minLength: 4, maxLength: 180 },
        },
        required: [
          'kind',
          'term',
          'partOfSpeech',
          'definition',
          'definitionZh',
          'example',
          'exampleZh',
        ],
      },
    },
    practicalExpressions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expression: { type: 'string', minLength: 2, maxLength: 100 },
          expressionType: {
            enum: ['phrase', 'idiom', 'response', 'phrasal_verb', 'slang'],
          },
          partOfSpeech: { type: 'string', minLength: 2, maxLength: 60 },
          chineseMeanings: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: { type: 'string', minLength: 2, maxLength: 80 },
          },
          coreMeaning: { type: 'string', minLength: 8, maxLength: 220 },
          context: { type: 'string', minLength: 6, maxLength: 160 },
          example: { type: 'string', minLength: 8, maxLength: 180 },
          exampleZh: { type: 'string', minLength: 4, maxLength: 160 },
          alternative: {
            type: 'object',
            additionalProperties: false,
            properties: {
              expression: { type: 'string', minLength: 2, maxLength: 100 },
              nuance: { type: 'string', minLength: 4, maxLength: 140 },
            },
            required: ['expression', 'nuance'],
          },
        },
        required: [
          'expression',
          'expressionType',
          'partOfSpeech',
          'chineseMeanings',
          'coreMeaning',
          'context',
          'example',
          'exampleZh',
          'alternative',
        ],
      },
    },
    topic: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string', minLength: 20, maxLength: 300 },
        preparationPoints: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string', minLength: 4, maxLength: 160 },
        },
      },
      required: ['prompt', 'preparationPoints'],
    },
  },
  required: [
    'theme',
    'sentence',
    'vocabulary',
    'practicalExpressions',
    'topic',
  ],
} as const

type JsonRecord = Record<string, unknown>

function requireRecord(value: unknown, code: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code)
  }
  return value as JsonRecord
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code)
  return value
}

function requireArray(value: unknown, length: number, code: string): unknown[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(code)
  return value
}

function requireStringArray(
  value: unknown,
  minLength: number,
  maxLength: number,
  code: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minLength ||
    value.length > maxLength ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(code)
  }
  return value
}

function requireTheme(value: unknown): DailyContentPayload['theme'] {
  const themes: ReadonlySet<string> = new Set([
    'learning',
    'campus',
    'technology',
    'environment',
    'work',
    'health',
    'city',
    'culture',
  ])
  if (typeof value !== 'string' || !themes.has(value)) {
    throw new Error('WORKERS_AI_INVALID_THEME')
  }
  return value as DailyContentPayload['theme']
}

export function buildCandidateFromCompactOutput(
  output: unknown,
  contentDate: string,
  provider: string,
): DailyContentCandidate {
  const root = requireRecord(parseResponse(output), 'WORKERS_AI_INVALID_ROOT')
  const sentence = requireRecord(root.sentence, 'WORKERS_AI_INVALID_SENTENCE')
  const vocabulary = requireArray(
    root.vocabulary,
    3,
    'WORKERS_AI_INVALID_VOCABULARY',
  ).map((value) => {
    const item = requireRecord(value, 'WORKERS_AI_INVALID_VOCABULARY_ITEM')
    return {
      kind: requireString(item.kind, 'WORKERS_AI_INVALID_VOCABULARY_KIND'),
      term: requireString(item.term, 'WORKERS_AI_INVALID_VOCABULARY_TERM'),
      partOfSpeech: requireString(
        item.partOfSpeech,
        'WORKERS_AI_INVALID_VOCABULARY_POS',
      ),
      definition: requireString(
        item.definition,
        'WORKERS_AI_INVALID_VOCABULARY_DEFINITION',
      ),
      definitionZh: requireString(
        item.definitionZh,
        'WORKERS_AI_INVALID_VOCABULARY_DEFINITION_ZH',
      ),
      example: requireString(
        item.example,
        'WORKERS_AI_INVALID_VOCABULARY_EXAMPLE',
      ),
      exampleZh: requireString(
        item.exampleZh,
        'WORKERS_AI_INVALID_VOCABULARY_EXAMPLE_ZH',
      ),
      usageNote: '结合词性、搭配和完整语境记忆，避免只背单一中文对译。',
    }
  })
  const practicalExpressions = requireArray(
    root.practicalExpressions,
    3,
    'WORKERS_AI_INVALID_EXPRESSIONS',
  ).map((value) => {
    const item = requireRecord(value, 'WORKERS_AI_INVALID_EXPRESSION_ITEM')
    const alternative = requireRecord(
      item.alternative,
      'WORKERS_AI_INVALID_EXPRESSION_ALTERNATIVE',
    )
    return {
      expression: requireString(
        item.expression,
        'WORKERS_AI_INVALID_EXPRESSION',
      ),
      expressionType: requireString(
        item.expressionType,
        'WORKERS_AI_INVALID_EXPRESSION_TYPE',
      ),
      partOfSpeech: requireString(
        item.partOfSpeech,
        'WORKERS_AI_INVALID_EXPRESSION_POS',
      ),
      chineseMeanings: requireStringArray(
        item.chineseMeanings,
        2,
        3,
        'WORKERS_AI_INVALID_EXPRESSION_MEANINGS',
      ),
      coreMeaning: requireString(
        item.coreMeaning,
        'WORKERS_AI_INVALID_EXPRESSION_CORE',
      ),
      usageNotes: [
        `常用于${requireString(item.context, 'WORKERS_AI_INVALID_EXPRESSION_CONTEXT')}；先判断双方关系与语气，再把整段表达作为词块使用。`,
      ],
      scenarios: [
        {
          label: '情景实战',
          description: requireString(
            item.context,
            'WORKERS_AI_INVALID_EXPRESSION_CONTEXT',
          ),
          example: requireString(
            item.example,
            'WORKERS_AI_INVALID_EXPRESSION_EXAMPLE',
          ),
          exampleZh: requireString(
            item.exampleZh,
            'WORKERS_AI_INVALID_EXPRESSION_EXAMPLE_ZH',
          ),
        },
        {
          label: '迁移练习',
          description: '换一个人物或场景复述同类意思，体会语气变化。',
          example: `Try using "${requireString(item.expression, 'WORKERS_AI_INVALID_EXPRESSION')}" in a different situation today.`,
          exampleZh: '今天试着在另一个合适的情境中使用这段表达。',
        },
      ],
      pitfalls: [
        '不要按字面逐词翻译，也不要在明显不合适的正式语境中生搬硬套。',
      ],
      alternatives: [
        {
          expression: requireString(
            alternative.expression,
            'WORKERS_AI_INVALID_ALTERNATIVE_EXPRESSION',
          ),
          nuance: requireString(
            alternative.nuance,
            'WORKERS_AI_INVALID_ALTERNATIVE_NUANCE',
          ),
        },
      ],
      ieltsUse:
        '可迁移到听力和阅读中的语气识别，并帮助理解自然交流中的隐含态度。',
    }
  })
  const topic = requireRecord(root.topic, 'WORKERS_AI_INVALID_TOPIC')
  const payload: DailyContentPayload = {
    schemaVersion: 2,
    contentDate,
    difficulty: 'C1',
    theme: requireTheme(root.theme),
    originType: 'ai_assisted',
    generatorVersion: 'workers-ai-v3',
    sentence: {
      english: requireString(
        sentence.english,
        'WORKERS_AI_INVALID_SENTENCE_ENGLISH',
      ),
      chinese: requireString(
        sentence.chinese,
        'WORKERS_AI_INVALID_SENTENCE_CHINESE',
      ),
      grammarNotes: [
        requireString(sentence.grammarNote, 'WORKERS_AI_INVALID_GRAMMAR_NOTE'),
      ],
      usageNotes: [
        requireString(sentence.usageNote, 'WORKERS_AI_INVALID_USAGE_NOTE'),
      ],
      collocations: vocabulary.slice(0, 2).map((item) => ({
        expression: item.term,
        meaning: item.definitionZh,
      })),
      alternatives: practicalExpressions.slice(0, 2).map((item) => ({
        expression: item.expression,
        note: item.chineseMeanings.join('；'),
      })),
      microExercise: requireString(
        sentence.microExercise,
        'WORKERS_AI_INVALID_MICRO_EXERCISE',
      ),
    },
    vocabulary: vocabulary as DailyContentPayload['vocabulary'],
    practicalExpressions:
      practicalExpressions as DailyContentPayload['practicalExpressions'],
    topic: {
      kind: 'writing',
      prompt: requireString(topic.prompt, 'WORKERS_AI_INVALID_TOPIC_PROMPT'),
      preparationPoints: requireStringArray(
        topic.preparationPoints,
        3,
        3,
        'WORKERS_AI_INVALID_TOPIC_POINTS',
      ),
    },
  }
  return validateAndSanitizeDailyContentCandidate(
    {
      payload,
      provider,
      attribution: 'MorrowLilt 每日学习材料',
    },
    contentDate,
    provider,
  )
}

function parseResponse(output: unknown): unknown {
  if (
    typeof output === 'object' &&
    output !== null &&
    (!('response' in output) ||
      (typeof output.response === 'object' && output.response !== null))
  ) {
    return 'response' in output ? output.response : output
  }
  const raw =
    typeof output === 'string'
      ? output
      : typeof output === 'object' &&
          output !== null &&
          'response' in output &&
          typeof output.response === 'string'
        ? output.response
        : ''
  if (!raw) throw new Error('WORKERS_AI_EMPTY_RESPONSE')
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('WORKERS_AI_INVALID_JSON')
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown
  } catch {
    throw new Error('WORKERS_AI_INVALID_JSON')
  }
}

function requestSignal(
  external?: AbortSignal,
  timeoutMs = 10_000,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

async function variationSeed(input: string): Promise<{
  nonce: string
  seed: number
}> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)),
  )
  const nonce = [...digest.slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const seed =
    (new DataView(digest.buffer).getUint32(8, false) % 2_147_483_646) + 1
  return { nonce, seed }
}

export class WorkersAiContentProvider implements ContentProvider {
  readonly name = 'cloudflare-workers-ai'
  private readonly ai: Ai
  constructor(ai: Ai) {
    this.ai = ai
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
    const recent = JSON.stringify(context.recentSummaries ?? [])
    const variation = await variationSeed(
      `${contentDate}\u0000${context.variationKey ?? 'default'}\u0000${context.attempt}`,
    )
    const output = await this.ai.run(
      model,
      {
        messages: [
          {
            role: 'system',
            content:
              'Create accurate C1-C2 English learning material that combines exam-level vocabulary with natural friend chat, offline interaction, gaming and online community English. Return JSON only. Never copy published test questions, include HTML, invent a source, or include personal data.',
          },
          {
            role: 'user',
            content: `Create one unique compact daily package for ${contentDate} in ${timeZone}. Use variation nonce ${variation.nonce}; it must not appear in the output. Avoid every sentence, vocabulary term and practical expression in this recent 30-day material: ${recent}. Include exactly 3 C1 vocabulary items with complete Chinese meanings and examples, plus exactly 3 natural expressions useful in friend chat, offline interaction, gaming or online communities. Give each expression one concrete context, a natural bilingual example and one nuanced alternative. The microExercise and topic prompt must be English. Keep every Chinese field concise and natural. Do not copy published questions, include HTML, invent a source or include personal data. Attempt ${context.attempt}.`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: compactDailyContentSchema,
        },
        max_tokens: 2800,
        seed: variation.seed,
        temperature: 0.65,
        frequency_penalty: 0.5,
        presence_penalty: 0.45,
      },
      {
        // Daily packages are substantially larger than dictionary responses.
        // Ten seconds was too aggressive in production and could abort a
        // healthy Workers AI generation before Resend was ever reached.
        signal: requestSignal(signal, 90_000),
        tags: ['daily-content', `attempt:${context.attempt}`],
      },
    )
    return buildCandidateFromCompactOutput(output, contentDate, this.name)
  }
}

export class WorkersAiDictionaryTranslationProvider implements DictionaryTranslationProvider {
  readonly name = 'cloudflare-workers-ai-translation'
  private readonly ai: Ai

  constructor(ai: Ai) {
    this.ai = ai
  }

  private validateTranslation(value: unknown): string {
    const translatedText = typeof value === 'string' ? value.trim() : ''
    if (
      translatedText.length < 1 ||
      translatedText.length > 1_000 ||
      !/[\u3400-\u9fff]/.test(translatedText) ||
      /<[^>]+>/.test(translatedText)
    ) {
      throw new Error('DICTIONARY_TRANSLATION_INVALID')
    }
    return translatedText
  }

  private async translateChunk(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    const items = texts.map((text, id) => ({ id, text }))
    const output = await this.ai.run(
      model,
      {
        messages: [
          {
            role: 'system',
            content:
              'Translate English dictionary definitions and examples into natural, precise Simplified Chinese. Preserve meaning, register, names and punctuation. Return every item exactly once as JSON and do not add commentary or HTML.',
          },
          {
            role: 'user',
            content: JSON.stringify({ items }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              translations: {
                type: 'array',
                minItems: texts.length,
                maxItems: texts.length,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'integer', minimum: 0 },
                    translatedText: { type: 'string', minLength: 1 },
                  },
                  required: ['id', 'translatedText'],
                },
              },
            },
            required: ['translations'],
          },
        },
        max_tokens: 2_800,
        temperature: 0.1,
      },
      {
        signal: requestSignal(signal, 18_000),
        tags: ['dictionary-translation-batch'],
      },
    )
    const parsed = parseResponse(output)
    const translations =
      typeof parsed === 'object' && parsed !== null && 'translations' in parsed
        ? parsed.translations
        : undefined
    if (!Array.isArray(translations)) {
      throw new Error('DICTIONARY_TRANSLATION_INVALID')
    }
    const byId = new Map<number, string>()
    for (const item of translations as unknown[]) {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('id' in item) ||
        typeof item.id !== 'number' ||
        !Number.isInteger(item.id) ||
        !('translatedText' in item)
      ) {
        throw new Error('DICTIONARY_TRANSLATION_INVALID')
      }
      const id = item.id
      if (id < 0 || id >= texts.length || byId.has(id)) {
        throw new Error('DICTIONARY_TRANSLATION_INVALID')
      }
      byId.set(id, this.validateTranslation(item.translatedText))
    }
    if (byId.size !== texts.length) {
      throw new Error('DICTIONARY_TRANSLATION_INCOMPLETE')
    }
    return texts.map((_, id) => byId.get(id)!)
  }

  private async translateIndividually(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    const translated = new Array<string>(texts.length)
    let nextIndex = 0
    const translateNext = async (): Promise<void> => {
      while (nextIndex < texts.length) {
        const index = nextIndex++
        let lastError: unknown
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const output = await this.ai.run(
              translationModel,
              {
                text: texts[index],
                source_lang: 'english',
                target_lang: 'chinese',
              },
              {
                signal: requestSignal(signal, 12_000),
                tags: ['dictionary-translation-fallback'],
              },
            )
            translated[index] = this.validateTranslation(
              typeof output === 'object' &&
                output !== null &&
                'translated_text' in output
                ? output.translated_text
                : undefined,
            )
            lastError = undefined
            break
          } catch (error) {
            lastError = error
          }
        }
        if (lastError) {
          throw lastError instanceof Error
            ? lastError
            : new Error('DICTIONARY_TRANSLATION_FAILED')
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, texts.length) }, translateNext),
    )
    return translated
  }

  async translateMany(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<Array<{ translatedText: string; attribution: string }>> {
    if (texts.length === 0) return []
    const translated = new Array<string>(texts.length)
    const chunks = Array.from(
      { length: Math.ceil(texts.length / 24) },
      (_, index) => ({
        start: index * 24,
        texts: texts.slice(index * 24, (index + 1) * 24),
      }),
    )
    let nextChunk = 0
    const translateNextChunk = async (): Promise<void> => {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk++]
        let values: string[]
        try {
          values = await this.translateChunk(chunk.texts, signal)
        } catch (error) {
          console.warn(
            JSON.stringify({
              event: 'dictionary_translation_batch_fallback',
              errorName: error instanceof Error ? error.name : 'UnknownError',
              itemCount: chunk.texts.length,
            }),
          )
          values = await this.translateIndividually(chunk.texts, signal)
        }
        values.forEach((value, index) => {
          translated[chunk.start + index] = value
        })
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, chunks.length) }, translateNextChunk),
    )
    return translated.map((translatedText) => ({
      translatedText,
      attribution: 'MorrowLilt 中文辅助释义',
    }))
  }
}
