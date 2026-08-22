type DictionaryCacheRow = {
  normalized_term: string
  provider: string
  payload_json: string
  source_url: string
  license_json: string
  attribution: string
  fetched_at: string
  expires_at: string
}

export type DictionaryCacheRecord = {
  normalizedTerm: string
  provider: string
  payload: unknown
  sourceUrl: string
  licenses: unknown
  attribution: string
  fetchedAt: string
  expiresAt: string
}

function mapCache(row: DictionaryCacheRow): DictionaryCacheRecord {
  return {
    normalizedTerm: row.normalized_term,
    provider: row.provider,
    payload: JSON.parse(row.payload_json) as unknown,
    sourceUrl: row.source_url,
    licenses: JSON.parse(row.license_json) as unknown,
    attribution: row.attribution,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  }
}

export async function getDictionaryCache(
  db: D1Database,
  normalizedTerm: string,
): Promise<DictionaryCacheRecord | undefined> {
  const row = await db
    .prepare(
      `SELECT normalized_term, provider, payload_json, source_url,
              license_json, attribution, fetched_at, expires_at
       FROM dictionary_cache WHERE normalized_term = ? LIMIT 1`,
    )
    .bind(normalizedTerm)
    .first<DictionaryCacheRow>()
  return row ? mapCache(row) : undefined
}

export async function saveDictionaryCache(
  db: D1Database,
  record: DictionaryCacheRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dictionary_cache (
         normalized_term, provider, payload_json, source_url, license_json,
         attribution, fetched_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(normalized_term) DO UPDATE SET
         provider = excluded.provider, payload_json = excluded.payload_json,
         source_url = excluded.source_url, license_json = excluded.license_json,
         attribution = excluded.attribution, fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
    )
    .bind(
      record.normalizedTerm,
      record.provider,
      JSON.stringify(record.payload),
      record.sourceUrl,
      JSON.stringify(record.licenses),
      record.attribution,
      record.fetchedAt,
      record.expiresAt,
    )
    .run()
}

export async function recordDictionarySearch(
  db: D1Database,
  profileId: string,
  normalizedTerm: string,
  searchedAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dictionary_search_history (
         profile_id, normalized_term, search_count, last_searched_at
       ) VALUES (?, ?, 1, ?)
       ON CONFLICT(profile_id, normalized_term) DO UPDATE SET
         search_count = dictionary_search_history.search_count + 1,
         last_searched_at = excluded.last_searched_at`,
    )
    .bind(profileId, normalizedTerm, searchedAt)
    .run()
}

export async function listDictionaryHistory(
  db: D1Database,
  profileId: string,
): Promise<
  Array<{ term: string; searchCount: number; lastSearchedAt: string }>
> {
  const result = await db
    .prepare(
      `SELECT normalized_term, search_count, last_searched_at
       FROM dictionary_search_history WHERE profile_id = ?
       ORDER BY last_searched_at DESC LIMIT 10`,
    )
    .bind(profileId)
    .all<{
      normalized_term: string
      search_count: number
      last_searched_at: string
    }>()
  return result.results.map((row) => ({
    term: row.normalized_term,
    searchCount: row.search_count,
    lastSearchedAt: row.last_searched_at,
  }))
}

export async function listHistorySuggestions(
  db: D1Database,
  profileId: string,
  query: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT normalized_term FROM dictionary_search_history
       WHERE profile_id = ? AND normalized_term >= ? AND normalized_term < ?
       ORDER BY search_count DESC, last_searched_at DESC LIMIT 12`,
    )
    .bind(profileId, query, `${query}\uffff`)
    .all<{ normalized_term: string }>()
  return result.results.map((row) => row.normalized_term)
}

export async function getSuggestionCache(
  db: D1Database,
  query: string,
  nowIso: string,
): Promise<string[] | undefined> {
  const row = await db
    .prepare(
      `SELECT suggestions_json FROM dictionary_suggestion_cache
       WHERE normalized_query = ? AND expires_at > ? LIMIT 1`,
    )
    .bind(query, nowIso)
    .first<{ suggestions_json: string }>()
  if (!row) return undefined
  try {
    const parsed = JSON.parse(row.suggestions_json) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : undefined
  } catch {
    return undefined
  }
}

export async function saveSuggestionCache(
  db: D1Database,
  query: string,
  suggestions: string[],
  now: number,
): Promise<void> {
  const fetchedAt = new Date(now).toISOString()
  const expiresAt = new Date(now + 24 * 60 * 60 * 1_000).toISOString()
  await db
    .prepare(
      `INSERT INTO dictionary_suggestion_cache (
         normalized_query, suggestions_json, fetched_at, expires_at
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(normalized_query) DO UPDATE SET
         suggestions_json = excluded.suggestions_json,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
    )
    .bind(query, JSON.stringify(suggestions), fetchedAt, expiresAt)
    .run()
}

export async function saveDictionaryTerm(input: {
  db: D1Database
  table: 'dictionary_favorites' | 'vocabulary_review_queue'
  profileId: string
  normalizedTerm: string
  provider: string
}): Promise<void> {
  const now = new Date().toISOString()
  const statement =
    input.table === 'dictionary_favorites'
      ? `INSERT INTO dictionary_favorites (
           id, profile_id, normalized_term, provider, created_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, normalized_term) DO NOTHING`
      : `INSERT INTO vocabulary_review_queue (
           id, profile_id, normalized_term, provider, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(profile_id, normalized_term) DO UPDATE SET
           status = 'active', provider = excluded.provider,
           updated_at = excluded.updated_at`
  const values =
    input.table === 'dictionary_favorites'
      ? [
          crypto.randomUUID(),
          input.profileId,
          input.normalizedTerm,
          input.provider,
          now,
        ]
      : [
          crypto.randomUUID(),
          input.profileId,
          input.normalizedTerm,
          input.provider,
          now,
          now,
        ]
  await input.db
    .prepare(statement)
    .bind(...values)
    .run()
}

export type CachedTranslation = {
  sourceText: string
  translatedText: string
  provider: string
  attribution: string
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getCachedTranslations(
  db: D1Database,
  texts: string[],
): Promise<Map<string, CachedTranslation>> {
  const unique = [...new Set(texts)]
  const output = new Map<string, CachedTranslation>()
  for (let start = 0; start < unique.length; start += 50) {
    const chunk = unique.slice(start, start + 50)
    const hashes = await Promise.all(chunk.map(sha256))
    const result = await db
      .prepare(
        `SELECT source_text, translated_text, provider, attribution
         FROM dictionary_translation_cache
         WHERE source_hash IN (${hashes.map(() => '?').join(', ')})`,
      )
      .bind(...hashes)
      .all<{
        source_text: string
        translated_text: string
        provider: string
        attribution: string
      }>()
    for (const row of result.results) {
      output.set(row.source_text, {
        sourceText: row.source_text,
        translatedText: row.translated_text,
        provider: row.provider,
        attribution: row.attribution,
      })
    }
  }
  return output
}

export async function saveCachedTranslations(
  db: D1Database,
  translations: CachedTranslation[],
): Promise<void> {
  const now = new Date().toISOString()
  for (let start = 0; start < translations.length; start += 50) {
    const chunk = translations.slice(start, start + 50)
    const statements = await Promise.all(
      chunk.map(async (item) =>
        db
          .prepare(
            `INSERT INTO dictionary_translation_cache (
               source_hash, source_text, translated_text, provider, attribution, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_hash) DO UPDATE SET
               translated_text = excluded.translated_text,
               provider = excluded.provider,
               attribution = excluded.attribution,
               created_at = excluded.created_at`,
          )
          .bind(
            await sha256(item.sourceText),
            item.sourceText,
            item.translatedText,
            item.provider,
            item.attribution,
            now,
          ),
      ),
    )
    await db.batch(statements)
  }
}
