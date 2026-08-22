import type {
  ContentDifficulty,
  ContentOriginType,
  ContentTheme,
  DailyContentCandidate,
  DailyContentPayload,
} from '../providers/contracts'
import {
  practicalExpressionGroup,
  practicalExpressionSeedCount,
} from './practical-expressions'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const safeVersionPattern = /^[A-Za-z0-9._/-]{1,80}$/
const forbiddenKeys = new Set([
  'apiKey',
  'answerKey',
  'authorization',
  'email',
  'html',
  'markdown',
  'providerKey',
  'rawHtml',
  'script',
  'secret',
  'style',
  'token',
])
const themes = new Set<ContentTheme>([
  'learning',
  'campus',
  'technology',
  'environment',
  'work',
  'health',
  'city',
  'culture',
])
const difficulties = new Set<ContentDifficulty>(['C1', 'C2'])
const originTypes = new Set<ContentOriginType>([
  'original',
  'ai_assisted',
  'licensed',
])

export class ContentValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ContentValidationError'
    this.code = code
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isBoundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function isEnglish(value: string): boolean {
  const latin = value.match(/[A-Za-z]/g)?.length ?? 0
  const han = value.match(/[\u3400-\u9fff]/g)?.length ?? 0
  return latin >= 12 && han === 0
}

function isNaturalChinese(value: string): boolean {
  return (value.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 6
}

function isSafeSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function normalizeSourceUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function assertNoForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenFields(item)
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      throw new ContentValidationError(
        'CONTENT_FORBIDDEN_FIELD',
        `External content contains forbidden field: ${key}`,
      )
    }
    assertNoForbiddenFields(child)
  }
}

export function sanitizePlainText(value: string): string {
  const withoutControls = [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return !(
        (code >= 0 && code <= 8) ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        code === 127
      )
    })
    .join('')
  return withoutControls
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;\/?(?:script|style|iframe)[^&]*&gt;/gi, ' ')
    .replace(/\bjavascript\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') return sanitizePlainText(value)
  if (Array.isArray(value)) return value.map(sanitizeUnknown)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, sanitizeUnknown(child)]),
  )
}

export function isContentDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function isNoteArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    value.every((item) => isBoundedString(item, 4, 240))
  )
}

export function isDailyContentPayload(
  value: unknown,
): value is DailyContentPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'contentDate',
      'difficulty',
      'theme',
      'originType',
      'generatorVersion',
      'sentence',
      'vocabulary',
      'practicalExpressions',
      'topic',
    ]) ||
    value.schemaVersion !== 2 ||
    typeof value.contentDate !== 'string' ||
    !isContentDate(value.contentDate) ||
    typeof value.difficulty !== 'string' ||
    !difficulties.has(value.difficulty as ContentDifficulty) ||
    typeof value.theme !== 'string' ||
    !themes.has(value.theme as ContentTheme) ||
    typeof value.originType !== 'string' ||
    !originTypes.has(value.originType as ContentOriginType) ||
    typeof value.generatorVersion !== 'string' ||
    !safeVersionPattern.test(value.generatorVersion)
  ) {
    return false
  }

  const sentence = value.sentence
  if (
    !isRecord(sentence) ||
    !hasOnlyKeys(sentence, [
      'english',
      'chinese',
      'grammarNotes',
      'usageNotes',
      'collocations',
      'alternatives',
      'microExercise',
    ]) ||
    !isBoundedString(sentence.english, 40, 320) ||
    !isEnglish(sentence.english) ||
    !isBoundedString(sentence.chinese, 12, 320) ||
    !isNaturalChinese(sentence.chinese) ||
    !isNoteArray(sentence.grammarNotes) ||
    !isNoteArray(sentence.usageNotes) ||
    !isBoundedString(sentence.microExercise, 12, 320) ||
    !isEnglish(sentence.microExercise)
  ) {
    return false
  }

  if (
    !Array.isArray(sentence.collocations) ||
    sentence.collocations.length < 2 ||
    sentence.collocations.length > 6 ||
    !sentence.collocations.every(
      (item) =>
        isRecord(item) &&
        hasOnlyKeys(item, ['expression', 'meaning']) &&
        isBoundedString(item.expression, 2, 100) &&
        isBoundedString(item.meaning, 2, 160),
    ) ||
    !Array.isArray(sentence.alternatives) ||
    sentence.alternatives.length < 2 ||
    sentence.alternatives.length > 6 ||
    !sentence.alternatives.every(
      (item) =>
        isRecord(item) &&
        hasOnlyKeys(item, ['expression', 'note']) &&
        isBoundedString(item.expression, 2, 140) &&
        isBoundedString(item.note, 2, 180),
    )
  ) {
    return false
  }

  if (
    !Array.isArray(value.vocabulary) ||
    value.vocabulary.length < 3 ||
    value.vocabulary.length > 10 ||
    !value.vocabulary.every(
      (item) =>
        isRecord(item) &&
        hasOnlyKeys(item, [
          'kind',
          'term',
          'partOfSpeech',
          'definition',
          'definitionZh',
          'example',
          'exampleZh',
          'usageNote',
        ]) &&
        (item.kind === 'word' ||
          item.kind === 'phrase' ||
          item.kind === 'expression') &&
        isBoundedString(item.term, 2, 100) &&
        (item.partOfSpeech === undefined ||
          isBoundedString(item.partOfSpeech, 2, 80)) &&
        isBoundedString(item.definition, 4, 220) &&
        (item.definitionZh === undefined ||
          (isBoundedString(item.definitionZh, 2, 120) &&
            (item.definitionZh.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 2)) &&
        isBoundedString(item.example, 12, 320) &&
        isEnglish(item.example) &&
        (item.exampleZh === undefined ||
          (isBoundedString(item.exampleZh, 4, 240) &&
            isNaturalChinese(item.exampleZh))) &&
        (item.usageNote === undefined ||
          isBoundedString(item.usageNote, 4, 240)),
    )
  ) {
    return false
  }

  if (value.practicalExpressions !== undefined) {
    if (
      !Array.isArray(value.practicalExpressions) ||
      value.practicalExpressions.length !== 3 ||
      !value.practicalExpressions.every((item) => {
        if (
          !isRecord(item) ||
          !hasOnlyKeys(item, [
            'expression',
            'expressionType',
            'partOfSpeech',
            'chineseMeanings',
            'coreMeaning',
            'usageNotes',
            'scenarios',
            'pitfalls',
            'alternatives',
            'ieltsUse',
          ]) ||
          !isBoundedString(item.expression, 2, 120) ||
          !['phrase', 'idiom', 'response', 'phrasal_verb', 'slang'].includes(
            String(item.expressionType),
          ) ||
          !isBoundedString(item.partOfSpeech, 2, 80) ||
          !Array.isArray(item.chineseMeanings) ||
          item.chineseMeanings.length < 2 ||
          item.chineseMeanings.length > 5 ||
          !item.chineseMeanings.every((meaning) =>
            isBoundedString(meaning, 2, 100),
          ) ||
          !isBoundedString(item.coreMeaning, 8, 300) ||
          !isNoteArray(item.usageNotes) ||
          !isNoteArray(item.pitfalls) ||
          !isBoundedString(item.ieltsUse, 8, 240) ||
          !Array.isArray(item.scenarios) ||
          item.scenarios.length < 2 ||
          item.scenarios.length > 4 ||
          !item.scenarios.every(
            (scenario) =>
              isRecord(scenario) &&
              hasOnlyKeys(scenario, [
                'label',
                'description',
                'example',
                'exampleZh',
              ]) &&
              isBoundedString(scenario.label, 2, 40) &&
              isBoundedString(scenario.description, 6, 240) &&
              isBoundedString(scenario.example, 8, 260) &&
              isEnglish(scenario.example) &&
              isBoundedString(scenario.exampleZh, 4, 240) &&
              isNaturalChinese(scenario.exampleZh),
          ) ||
          !Array.isArray(item.alternatives) ||
          item.alternatives.length < 1 ||
          item.alternatives.length > 4 ||
          !item.alternatives.every(
            (alternative) =>
              isRecord(alternative) &&
              hasOnlyKeys(alternative, ['expression', 'nuance']) &&
              isBoundedString(alternative.expression, 2, 120) &&
              isBoundedString(alternative.nuance, 4, 180),
          )
        ) {
          return false
        }
        return true
      })
    ) {
      return false
    }
  }

  const topic = value.topic
  return (
    isRecord(topic) &&
    hasOnlyKeys(topic, ['kind', 'prompt', 'preparationPoints']) &&
    (topic.kind === 'speaking' || topic.kind === 'writing') &&
    isBoundedString(topic.prompt, 20, 420) &&
    isEnglish(topic.prompt) &&
    isNoteArray(topic.preparationPoints)
  )
}

export function isDailyContentCandidate(
  value: unknown,
): value is DailyContentCandidate {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['payload', 'provider', 'attribution', 'sourceUrl']) ||
    !isDailyContentPayload(value.payload) ||
    !isBoundedString(value.provider, 2, 80) ||
    !isBoundedString(value.attribution, 4, 240)
  ) {
    return false
  }
  return (
    value.sourceUrl === undefined ||
    (typeof value.sourceUrl === 'string' && isSafeSourceUrl(value.sourceUrl))
  )
}

export function validateAndSanitizeDailyContentCandidate(
  value: unknown,
  expectedDate: string,
  expectedProvider?: string,
): DailyContentCandidate {
  assertNoForbiddenFields(value)
  const sanitized = sanitizeUnknown(value)
  if (!isDailyContentCandidate(sanitized)) {
    throw new ContentValidationError(
      'CONTENT_SCHEMA_INVALID',
      'External content did not match daily-content JSON Schema v2',
    )
  }
  if (sanitized.payload.contentDate !== expectedDate) {
    throw new ContentValidationError(
      'CONTENT_DATE_MISMATCH',
      'External content returned a different business date',
    )
  }
  if (
    sanitized.payload.originType === 'licensed' &&
    sanitized.sourceUrl === undefined
  ) {
    throw new ContentValidationError(
      'CONTENT_SOURCE_REQUIRED',
      'Licensed content must include its HTTPS source URL',
    )
  }
  if (
    /official\s+(?:ielts|score|question)|cambridge\s+ielts/i.test(
      JSON.stringify(sanitized),
    )
  ) {
    throw new ContentValidationError(
      'CONTENT_OFFICIAL_CLAIM',
      'External content made a prohibited official-content claim',
    )
  }
  return {
    ...sanitized,
    provider: expectedProvider ?? sanitized.provider,
    sourceUrl:
      sanitized.sourceUrl === undefined
        ? undefined
        : normalizeSourceUrl(sanitized.sourceUrl),
  }
}

type LegacyPayload = {
  schemaVersion: 1
  contentDate: string
  sentence: {
    english: string
    chinese: string
    notes: string[]
    microExercise: string
  }
  vocabulary: DailyContentPayload['vocabulary']
  topic: DailyContentPayload['topic']
}

function isLegacyPayload(value: unknown): value is LegacyPayload {
  if (!isRecord(value) || value.schemaVersion !== 1) return false
  const sentence = value.sentence
  return (
    typeof value.contentDate === 'string' &&
    isContentDate(value.contentDate) &&
    isRecord(sentence) &&
    typeof sentence.english === 'string' &&
    typeof sentence.chinese === 'string' &&
    Array.isArray(sentence.notes) &&
    sentence.notes.every((note) => typeof note === 'string') &&
    typeof sentence.microExercise === 'string' &&
    Array.isArray(value.vocabulary) &&
    isRecord(value.topic)
  )
}

export function parseDailyContentPayload(value: string): DailyContentPayload {
  const parsed: unknown = JSON.parse(value)
  if (isDailyContentPayload(parsed)) return enrichStoredPayload(parsed)
  if (isLegacyPayload(parsed)) {
    return enrichStoredPayload({
      schemaVersion: 2,
      contentDate: parsed.contentDate,
      difficulty: 'C1',
      theme: 'learning',
      originType: 'original',
      generatorVersion: 'legacy-v1',
      sentence: {
        english: parsed.sentence.english,
        chinese: parsed.sentence.chinese,
        grammarNotes: parsed.sentence.notes,
        usageNotes: ['历史快照：语用说明未单独存储。'],
        collocations: [
          { expression: 'sustain an effort', meaning: '长期维持努力' },
          { expression: 'make progress', meaning: '取得进步' },
        ],
        alternatives: [
          { expression: 'In other words', note: '用于换一种方式解释。' },
          { expression: 'More specifically', note: '用于引入具体说明。' },
        ],
        microExercise: parsed.sentence.microExercise,
      },
      vocabulary: parsed.vocabulary,
      topic: parsed.topic,
    })
  }
  throw new Error('Stored daily content does not match a supported schema')
}

function inferPartOfSpeech(
  item: DailyContentPayload['vocabulary'][number],
): string {
  if (item.kind === 'phrase') return '短语 phrase'
  if (item.kind === 'expression') return '固定表达 expression'
  const term = item.term.toLowerCase()
  const definition = item.definition.toLowerCase()
  if (term.endsWith('ly')) return '副词 adverb'
  if (/^(to|be able to)\b/.test(definition)) return '动词 verb'
  if (
    /^(having|showing|able|relating|likely|easy|difficult)\b/.test(definition)
  ) {
    return '形容词 adjective'
  }
  return '名词或核心词汇（结合完整义项辨析）'
}

function enrichStoredPayload(
  payload: DailyContentPayload,
): DailyContentPayload {
  const dayIndex =
    Math.abs(
      Math.floor(Date.parse(`${payload.contentDate}T00:00:00Z`) / 86_400_000),
    ) % practicalExpressionSeedCount
  return {
    ...payload,
    vocabulary: payload.vocabulary.map((item) => ({
      ...item,
      partOfSpeech: item.partOfSpeech ?? inferPartOfSpeech(item),
    })),
    practicalExpressions:
      payload.practicalExpressions ?? practicalExpressionGroup(dayIndex),
  }
}
