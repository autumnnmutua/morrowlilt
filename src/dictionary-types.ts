export type DictionaryLicense = { name: string; url?: string }

export type DictionaryGeneratedField = {
  text: string
  provider: string
  attribution: string
  originType: 'translated' | 'ai_assisted' | 'original'
}

export type DictionarySense = {
  definition: string
  definitionSourceType: 'dictionary'
  translatedDefinition?: DictionaryGeneratedField
  examples: Array<{
    text: string
    sourceType: 'dictionary'
    translation?: DictionaryGeneratedField
  }>
  synonyms: string[]
  antonyms: string[]
}

export type DictionaryEntry = {
  headword: string
  phonetic?: string
  chineseSummary?: string
  pronunciations: Array<{
    text?: string
    audioUrl?: string
    sourceUrl?: string
    license?: DictionaryLicense
  }>
  forms: string[]
  inflections: Array<{ form: string; label: string }>
  origin?: string
  partsOfSpeech: Array<{
    label: string
    senses: DictionarySense[]
    synonyms: string[]
    antonyms: string[]
  }>
  sourceUrls: string[]
  license?: DictionaryLicense
}

export type DictionaryResult = {
  normalizedTerm: string
  entries: DictionaryEntry[]
  requestUrl: string
  licenses: DictionaryLicense[]
  attribution: string
  cacheStatus: 'miss' | 'fresh' | 'stale'
  warningCode?: string
  fetchedAt?: string
  expiresAt?: string
}

export type DictionaryHistoryItem = {
  term: string
  searchCount: number
  lastSearchedAt: string
}

export type DictionarySuggestions = {
  suggestions: string[]
  source: 'local' | 'mixed'
}

export type ExamDictionaryList = {
  slug: string
  name: string
  shortName: string
  description: string
  source: { name: string; url: string; license: string }
  entryCount: number
  letterCounts: Record<string, number>
  updatedAt: string
}

export type ExamDictionaryCatalog = { lists: ExamDictionaryList[] }

export type ExamDictionaryPage = {
  list: ExamDictionaryList
  letter: string
  letterEntryCount: number
  words: Array<{ word: string; normalizedWord: string; rank: number }>
  hasMore: boolean
  nextCursor?: string
}
