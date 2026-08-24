export type DictionaryLicense = { name: string; url?: string }

export type DictionaryGeneratedField = {
  text: string
  provider: string
  attribution: string
  originType: 'translated' | 'ai_assisted' | 'original'
}

export type DictionaryExample = {
  text: string
  sourceType: 'dictionary'
  translation?: DictionaryGeneratedField
}

export type DictionarySense = {
  definition: string
  definitionSourceType: 'dictionary'
  translatedDefinition?: DictionaryGeneratedField
  examples: DictionaryExample[]
  synonyms: string[]
  antonyms: string[]
}

export type DictionaryPartOfSpeech = {
  label: string
  senses: DictionarySense[]
  synonyms: string[]
  antonyms: string[]
}

export type DictionaryPronunciation = {
  text?: string
  audioUrl?: string
  sourceUrl?: string
  license?: DictionaryLicense
}

export type DictionaryEntry = {
  headword: string
  phonetic?: string
  chineseSummary?: string
  chineseSummaryLines?: string[]
  pronunciations: DictionaryPronunciation[]
  forms: string[]
  inflections: Array<{ form: string; label: string }>
  origin?: string
  partsOfSpeech: DictionaryPartOfSpeech[]
  sourceUrls: string[]
  license?: DictionaryLicense
}

export type DictionaryProviderResult = {
  entries: DictionaryEntry[]
  rawPayload: unknown
  requestUrl: string
  licenses: DictionaryLicense[]
  attribution: string
}

export interface DictionaryProvider {
  readonly name: string
  lookup(term: string, signal?: AbortSignal): Promise<DictionaryProviderResult>
  parseCachedPayload(
    payload: unknown,
    requestUrl: string,
  ): DictionaryProviderResult
}

export interface DictionaryTranslationProvider {
  readonly name: string
  translateMany(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<Array<{ translatedText: string; attribution: string }>>
}

export type ContentDifficulty = 'C1' | 'C2'
export type ContentTheme =
  | 'learning'
  | 'campus'
  | 'technology'
  | 'environment'
  | 'work'
  | 'health'
  | 'city'
  | 'culture'
export type ContentOriginType = 'original' | 'ai_assisted' | 'licensed'

export type DailyContentPayload = {
  schemaVersion: 2
  contentDate: string
  difficulty: ContentDifficulty
  theme: ContentTheme
  originType: ContentOriginType
  generatorVersion: string
  sentence: {
    english: string
    chinese: string
    grammarNotes: string[]
    usageNotes: string[]
    collocations: Array<{ expression: string; meaning: string }>
    alternatives: Array<{ expression: string; note: string }>
    microExercise: string
  }
  vocabulary: Array<{
    kind: 'word' | 'phrase' | 'expression'
    term: string
    partOfSpeech?: string
    definition: string
    definitionZh?: string
    example: string
    exampleZh?: string
    usageNote?: string
  }>
  practicalExpressions?: Array<{
    expression: string
    expressionType: 'phrase' | 'idiom' | 'response' | 'phrasal_verb' | 'slang'
    partOfSpeech: string
    chineseMeanings: string[]
    coreMeaning: string
    usageNotes: string[]
    scenarios: Array<{
      label: string
      description: string
      example: string
      exampleZh: string
    }>
    pitfalls: string[]
    alternatives: Array<{ expression: string; nuance: string }>
    ieltsUse: string
  }>
  topic: {
    kind: 'speaking' | 'writing'
    prompt: string
    preparationPoints: string[]
  }
}

export type DailyContentCandidate = {
  payload: DailyContentPayload
  provider: string
  attribution: string
  sourceUrl?: string
}

export type ContentGenerationContext = {
  attempt: number
  recentFingerprints: string[]
  recentSummaries?: Array<{
    sentence: string
    terms: string[]
    expressions?: string[]
    topic: string
  }>
  regeneration: boolean
  variationKey?: string
}

export interface ContentProvider {
  readonly name: string
  generateDailyContent(
    contentDate: string,
    timeZone: string,
    context?: ContentGenerationContext,
    signal?: AbortSignal,
  ): Promise<DailyContentCandidate>
}

export interface TranslationProvider {
  readonly name: string
  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    signal?: AbortSignal,
  ): Promise<{ translatedText: string; attribution: string }>
}

export type DailyEmailMessage = {
  contentDate: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

export interface EmailProvider {
  readonly name: string
  sendDailyDigest(
    message: DailyEmailMessage,
    signal?: AbortSignal,
  ): Promise<{ messageId: string }>
}
