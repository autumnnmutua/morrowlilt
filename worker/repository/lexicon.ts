import { buildInflections } from '../dictionary/morphology'
import type {
  DictionaryEntry,
  DictionaryPartOfSpeech,
  DictionaryProviderResult,
} from '../providers/contracts'

const sourceUrl = 'https://en-word.net/'
const license = {
  name: 'Open English WordNet 2025 — CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
}

type SenseRow = {
  normalized_lemma: string
  lemma: string
  part_of_speech: string
  definition: string
  examples_json: string
  synonyms_json: string
}

type FormRow = {
  normalized_lemma: string
  lemma: string
  part_of_speech: string
  form: string
  form_label: string
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function mergeParts(rows: SenseRow[]): DictionaryPartOfSpeech[] {
  const parts = new Map<string, DictionaryPartOfSpeech>()
  for (const row of rows) {
    const part = parts.get(row.part_of_speech) ?? {
      label: row.part_of_speech,
      senses: [],
      synonyms: [],
      antonyms: [],
    }
    const synonyms = parseStringArray(row.synonyms_json).filter(
      (item) => item.toLocaleLowerCase('en') !== row.normalized_lemma,
    )
    part.senses.push({
      definition: row.definition,
      definitionSourceType: 'dictionary',
      examples: parseStringArray(row.examples_json).map((text) => ({
        text,
        sourceType: 'dictionary',
      })),
      synonyms,
      antonyms: [],
    })
    part.synonyms.push(...synonyms)
    parts.set(row.part_of_speech, part)
  }
  return [...parts.values()].map((part) => ({
    ...part,
    synonyms: [...new Set(part.synonyms)],
  }))
}

function groupByLemma<T extends { normalized_lemma: string }>(
  rows: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.normalized_lemma) ?? []
    group.push(row)
    groups.set(row.normalized_lemma, group)
  }
  return groups
}

export async function lookupLocalLexicon(
  db: D1Database,
  normalizedTerm: string,
): Promise<DictionaryProviderResult | undefined> {
  const lemmaResult = await db
    .prepare(
      `SELECT normalized_lemma, lemma FROM dictionary_lexicon_forms
       WHERE normalized_form = ?
       UNION
       SELECT normalized_lemma, lemma FROM dictionary_lexicon_senses
       WHERE normalized_lemma = ?
       ORDER BY normalized_lemma LIMIT 12`,
    )
    .bind(normalizedTerm, normalizedTerm)
    .all<{ normalized_lemma: string; lemma: string }>()
  if (lemmaResult.results.length === 0) return undefined

  const normalizedLemmas = lemmaResult.results.map(
    (row) => row.normalized_lemma,
  )
  const placeholders = normalizedLemmas.map(() => '?').join(', ')
  const [senseResult, formResult] = await Promise.all([
    db
      .prepare(
        `SELECT normalized_lemma, lemma, part_of_speech, definition,
                examples_json, synonyms_json
         FROM dictionary_lexicon_senses
         WHERE normalized_lemma IN (${placeholders})
         ORDER BY normalized_lemma, part_of_speech, id`,
      )
      .bind(...normalizedLemmas)
      .all<SenseRow>(),
    db
      .prepare(
        `SELECT normalized_lemma, lemma, part_of_speech, form, form_label
         FROM dictionary_lexicon_forms
         WHERE normalized_lemma IN (${placeholders})
         ORDER BY normalized_lemma, part_of_speech, form`,
      )
      .bind(...normalizedLemmas)
      .all<FormRow>(),
  ])
  const sensesByLemma = groupByLemma(senseResult.results)
  const formsByLemma = groupByLemma(formResult.results)
  const entries: DictionaryEntry[] = []
  for (const lemmaRow of lemmaResult.results) {
    const partsOfSpeech = mergeParts(
      sensesByLemma.get(lemmaRow.normalized_lemma) ?? [],
    )
    const suppliedForms = (
      formsByLemma.get(lemmaRow.normalized_lemma) ?? []
    ).map((row) => row.form)
    entries.push({
      headword: lemmaRow.lemma,
      pronunciations: [],
      forms: [...new Set(suppliedForms)],
      inflections: buildInflections(
        lemmaRow.lemma,
        partsOfSpeech.map((part) => part.label),
        suppliedForms,
      ),
      partsOfSpeech,
      sourceUrls: [sourceUrl],
      license,
    })
  }
  return {
    entries,
    rawPayload: null,
    requestUrl: sourceUrl,
    licenses: [license],
    attribution:
      'Definitions, examples and lexical relations from Open English WordNet 2025.',
  }
}

export async function listLocalLexiconSuggestions(
  db: D1Database,
  query: string,
  limit = 12,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT normalized_lemma AS suggestion
       FROM dictionary_lexicon_senses
       WHERE normalized_lemma >= ? AND normalized_lemma < ?
       GROUP BY normalized_lemma
       ORDER BY length(normalized_lemma), normalized_lemma
       LIMIT ?`,
    )
    .bind(query, `${query}\uffff`, limit)
    .all<{ suggestion: string }>()
  return result.results.map((row) => row.suggestion)
}

export async function getLexiconStats(db: D1Database): Promise<{
  version?: string
  senseCount: number
  lemmaCount: number
}> {
  const row = await db
    .prepare(
      `SELECT resource_version, sense_count, lemma_count
       FROM dictionary_lexicon_metadata
       WHERE resource_name = 'open-english-wordnet' LIMIT 1`,
    )
    .first<{
      resource_version: string
      sense_count: number
      lemma_count: number
    }>()
  return row
    ? {
        version: row.resource_version,
        senseCount: row.sense_count,
        lemmaCount: row.lemma_count,
      }
    : { senseCount: 0, lemmaCount: 0 }
}
