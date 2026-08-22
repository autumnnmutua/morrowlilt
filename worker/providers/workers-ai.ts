import { validateAndSanitizeDailyContentCandidate } from '../content/schema'
import type {
  ContentGenerationContext,
  ContentProvider,
  DailyContentCandidate,
  DictionaryTranslationProvider,
} from './contracts'

const model = '@cf/meta/llama-3.1-8b-instruct-fp8' as const
const translationModel = '@cf/meta/m2m100-1.2b' as const

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
            content: `Create one unique daily package for ${contentDate} in ${timeZone}. Use variation nonce ${variation.nonce}; it is not user data and must not appear in the output. Avoid every sentence, vocabulary term and practical expression in this recent 30-day material: ${recent}. Include exactly 3 useful vocabulary items and exactly 3 idiomatic practical expressions. Every vocabulary item must have a precise part of speech, natural Chinese meaning, English example, Chinese example translation and usage note. Practical expressions must feel current but not ephemeral, and cover real friend chat, offline interaction, games or Discord without forcing slang. Give multiple Chinese meanings, metaphor/core meaning, two concrete scenarios, mistake prevention, a nuanced alternative and a formal exam-use transfer. Return exactly this JSON shape: {"schemaVersion":2,"contentDate":"${contentDate}","difficulty":"C1","theme":"learning|campus|technology|environment|work|health|city|culture","originType":"ai_assisted","generatorVersion":"workers-ai-v2","sentence":{"english":"40-240 English characters","chinese":"natural Chinese translation","grammarNotes":["Chinese note"],"usageNotes":["Chinese note"],"collocations":[{"expression":"English","meaning":"Chinese"},{"expression":"English","meaning":"Chinese"}],"alternatives":[{"expression":"English","note":"Chinese"},{"expression":"English","note":"Chinese"}],"microExercise":"English exercise"},"vocabulary":[{"kind":"word|phrase|expression","term":"English","partOfSpeech":"precise Chinese POS","definition":"English definition","definitionZh":"complete Chinese definition","example":"English example","exampleZh":"natural Chinese translation","usageNote":"Chinese usage note"}],"practicalExpressions":[{"expression":"natural English sentence","expressionType":"phrase|idiom|response|phrasal_verb|slang","partOfSpeech":"Chinese expression type","chineseMeanings":["Chinese meaning 1","Chinese meaning 2"],"coreMeaning":"Chinese metaphor and semantic core","usageNotes":["Chinese register or nuance note"],"scenarios":[{"label":"Chinese scenario label","description":"Chinese concrete situation","example":"English dialogue/example","exampleZh":"Chinese translation"},{"label":"Chinese scenario label","description":"Chinese concrete situation","example":"English dialogue/example","exampleZh":"Chinese translation"}],"pitfalls":["Chinese mistake warning"],"alternatives":[{"expression":"English alternative","nuance":"Chinese contrast"}],"ieltsUse":"Chinese explanation of formal listening/reading/writing transfer"}],"topic":{"kind":"writing","prompt":"original English analytical prompt","preparationPoints":["Chinese planning point","Chinese planning point","Chinese planning point"]}}. Repeat the vocabulary object 3 times and the practicalExpressions object 3 times with different content. Attempt ${context.attempt}.`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 3800,
        seed: variation.seed,
        temperature: 0.78,
        frequency_penalty: 0.5,
        presence_penalty: 0.45,
      },
      {
        signal: requestSignal(signal),
        tags: ['daily-content', `attempt:${context.attempt}`],
      },
    )
    return validateAndSanitizeDailyContentCandidate(
      {
        payload: parseResponse(output),
        provider: this.name,
        attribution: 'MorrowLilt 每日学习材料',
      },
      contentDate,
      this.name,
    )
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
              code:
                error instanceof Error
                  ? error.message.slice(0, 80)
                  : 'UNKNOWN_ERROR',
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
