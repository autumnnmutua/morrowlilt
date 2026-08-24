import type {
  DictionaryPartOfSpeech,
  DictionaryProviderResult,
} from '../providers/contracts'

export type ExamDictionaryListRow = {
  slug: string
  name: string
  short_name: string
  description: string
  source_name: string
  source_url: string
  source_license: string
  entry_count: number
  letter_counts_json: string
  updated_at: string
}

type ExamDictionaryEntryRow = {
  normalized_word: string
  display_word: string
  rank: number
}

type ExamLexemeRow = {
  normalized_word: string
  display_word: string
  phonetic: string | null
  english_definition: string
  chinese_translation: string
  parts_of_speech: string
  exchange: string
  source_name: string
  source_url: string
  source_license: string
}

const partLabels: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  vi: 'intransitive verb',
  vt: 'transitive verb',
  aux: 'auxiliary verb',
  adj: 'adjective',
  a: 'adjective',
  adv: 'adverb',
  ad: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  det: 'determiner',
  art: 'determiner',
  int: 'interjection',
  num: 'numeral',
  abbr: 'abbreviation',
}

const exchangeLabels: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词 / 动名词',
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '名词复数',
  '0': '原形',
  '1': '原形变化类型',
}

function parseLetterCounts(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          /^[A-Z]$/.test(entry[0]) &&
          typeof entry[1] === 'number' &&
          Number.isInteger(entry[1]) &&
          entry[1] >= 0,
      ),
    )
  } catch {
    return {}
  }
}

export async function listExamDictionaries(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT slug, name, short_name, description, source_name, source_url,
              source_license, entry_count, letter_counts_json, updated_at
       FROM exam_dictionary_lists ORDER BY sort_order`,
    )
    .all<ExamDictionaryListRow>()
  return result.results.map((row) => ({
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    source: {
      name: row.source_name,
      url: row.source_url,
      license: row.source_license,
    },
    entryCount: row.entry_count,
    letterCounts: parseLetterCounts(row.letter_counts_json),
    updatedAt: row.updated_at,
  }))
}

export async function getExamDictionaryList(db: D1Database, slug: string) {
  const row = await db
    .prepare(
      `SELECT slug, name, short_name, description, source_name, source_url,
              source_license, entry_count, letter_counts_json, updated_at
       FROM exam_dictionary_lists WHERE slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first<ExamDictionaryListRow>()
  return row
    ? {
        slug: row.slug,
        name: row.name,
        shortName: row.short_name,
        description: row.description,
        source: {
          name: row.source_name,
          url: row.source_url,
          license: row.source_license,
        },
        entryCount: row.entry_count,
        letterCounts: parseLetterCounts(row.letter_counts_json),
        updatedAt: row.updated_at,
      }
    : undefined
}

export async function listExamDictionaryWords(input: {
  db: D1Database
  slug: string
  letter: string
  cursor?: string
  limit: number
}) {
  const result = await input.db
    .prepare(
      `SELECT normalized_word, display_word, rank
       FROM exam_dictionary_entries
       WHERE list_slug = ? AND initial = ? AND normalized_word > ?
       ORDER BY normalized_word LIMIT ?`,
    )
    .bind(input.slug, input.letter, input.cursor ?? '', input.limit + 1)
    .all<ExamDictionaryEntryRow>()
  const hasMore = result.results.length > input.limit
  const rows = result.results.slice(0, input.limit)
  return {
    words: rows.map((row) => ({
      word: row.display_word,
      normalizedWord: row.normalized_word,
      rank: row.rank,
    })),
    hasMore,
    nextCursor: hasMore ? rows.at(-1)?.normalized_word : undefined,
  }
}

function normalizedPartLabel(raw: string): string {
  return partLabels[raw.toLowerCase()] ?? raw.toLowerCase()
}

function splitDefinitions(value: string): Array<{
  part: string
  text: string
}> {
  const rows: Array<{ part: string; text: string }> = []
  let currentPart = 'other'
  for (const rawLine of value.replace(/\\n/g, '\n').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || /^\[(?:网络|其它|其他|Web)\]/i.test(line)) continue
    const match = line.match(/^([a-z]+)\.\s*(.+)$/i)
    if (match) {
      currentPart = normalizedPartLabel(match[1])
      rows.push({ part: currentPart, text: match[2].trim() })
    } else {
      rows.push({ part: currentPart, text: line })
    }
  }
  return rows
}

function partsFromPosition(value: string): string[] {
  return value
    .split('/')
    .map((item) => item.split(':')[0]?.trim())
    .filter((item): item is string => Boolean(item))
    .map(normalizedPartLabel)
}

function buildParts(row: ExamLexemeRow): DictionaryPartOfSpeech[] {
  const english = splitDefinitions(row.english_definition)
  const chinese = splitDefinitions(row.chinese_translation)
  const labels = [
    ...new Set([
      ...english.map((item) => item.part),
      ...chinese.map((item) => item.part),
      ...partsFromPosition(row.parts_of_speech),
    ]),
  ].filter((label) => label !== 'other' || english.length + chinese.length > 0)
  return labels.map((label) => {
    const englishSenses = english.filter((item) => item.part === label)
    const chineseSenses = chinese.filter((item) => item.part === label)
    const length = Math.max(englishSenses.length, chineseSenses.length, 1)
    return {
      label,
      senses: Array.from({ length }, (_, index) => ({
        definition:
          englishSenses[index]?.text ??
          englishSenses.at(-1)?.text ??
          `ECDICT ${label} definition`,
        definitionSourceType: 'dictionary' as const,
        translatedDefinition: chineseSenses[index]
          ? {
              text: chineseSenses[index].text,
              provider: row.source_name,
              attribution: `${row.source_name} bilingual dictionary data`,
              originType: 'translated' as const,
            }
          : undefined,
        examples: [],
        synonyms: [],
        antonyms: [],
      })),
      synonyms: [],
      antonyms: [],
    }
  })
}

function parseExchange(value: string) {
  return value
    .split('/')
    .map((item) => {
      const separator = item.indexOf(':')
      if (separator < 1) return undefined
      const code = item.slice(0, separator)
      const form = item.slice(separator + 1).trim()
      if (!form) return undefined
      return { form, label: exchangeLabels[code] ?? code }
    })
    .filter((item): item is { form: string; label: string } => Boolean(item))
}

export async function lookupExamLexeme(
  db: D1Database,
  normalizedWord: string,
): Promise<DictionaryProviderResult | undefined> {
  const row = await db
    .prepare(
      `SELECT normalized_word, display_word, phonetic, english_definition,
              chinese_translation, parts_of_speech, exchange, source_name,
              source_url, source_license
       FROM dictionary_exam_lexemes WHERE normalized_word = ? LIMIT 1`,
    )
    .bind(normalizedWord)
    .first<ExamLexemeRow>()
  if (!row) return undefined
  const inflections = parseExchange(row.exchange)
  const license = { name: `${row.source_name} — ${row.source_license}` }
  return {
    entries: [
      {
        headword: row.display_word,
        phonetic: row.phonetic ?? undefined,
        pronunciations: [],
        forms: [...new Set(inflections.map((item) => item.form))],
        inflections,
        partsOfSpeech: buildParts(row),
        sourceUrls: [row.source_url],
        license,
      },
    ],
    rawPayload: null,
    requestUrl: row.source_url,
    licenses: [license],
    attribution: `${row.source_name} bilingual dictionary data.`,
  }
}
