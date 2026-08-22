import { computeContentFingerprint } from '../content/fingerprint'
import { parseDailyContentPayload } from '../content/schema'
import type {
  DailyContentCandidate,
  DailyContentPayload,
} from '../providers/contracts'
import {
  getDailyContentComponents,
  type DailyContentSource,
  type PersistedDailyContent,
} from './daily-content'

type ProfileDailyContentRow = {
  id: string
  profile_id: string
  content_date: string
  content_json: string
  content_hash: string
  source: DailyContentSource
  provider: string
  attribution: string
  generated_at: string
  difficulty: DailyContentPayload['difficulty']
  theme: DailyContentPayload['theme']
  origin_type: DailyContentPayload['originType']
  source_url: string | null
  fingerprint: string
  generator_version: string
  immutable_created_at: string
}

const columns = `id, profile_id, content_date, content_json, content_hash,
  source, provider, attribution, generated_at, difficulty, theme, origin_type,
  source_url, fingerprint, generator_version, immutable_created_at`

function mapRow(row: ProfileDailyContentRow): PersistedDailyContent {
  return {
    id: row.id,
    contentDate: row.content_date,
    payload: parseDailyContentPayload(row.content_json),
    contentHash: row.content_hash,
    source: row.source,
    provider: row.provider,
    attribution: row.attribution,
    generatedAt: row.generated_at,
    difficulty: row.difficulty,
    theme: row.theme,
    originType: row.origin_type,
    sourceUrl: row.source_url ?? undefined,
    fingerprint: row.fingerprint,
    generatorVersion: row.generator_version,
    createdAt: row.immutable_created_at,
  }
}

async function hashPayload(payload: DailyContentPayload): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getProfileDailyContent(
  db: D1Database,
  profileId: string,
  contentDate: string,
): Promise<PersistedDailyContent | undefined> {
  const row = await db
    .prepare(
      `SELECT ${columns} FROM profile_daily_content
       WHERE profile_id = ? AND content_date = ? LIMIT 1`,
    )
    .bind(profileId, contentDate)
    .first<ProfileDailyContentRow>()
  return row ? mapRow(row) : undefined
}

export async function listProfileDailyContentRange(
  db: D1Database,
  profileId: string,
  startExclusive: string,
  endInclusive: string,
): Promise<PersistedDailyContent[]> {
  const result = await db
    .prepare(
      `SELECT ${columns} FROM profile_daily_content
       WHERE profile_id = ? AND content_date > ? AND content_date <= ?
       ORDER BY content_date ASC`,
    )
    .bind(profileId, startExclusive, endInclusive)
    .all<ProfileDailyContentRow>()
  return result.results.map(mapRow)
}

export async function listRecentProfileDailyContent(
  db: D1Database,
  profileId: string,
  contentDate: string,
  limit = 30,
): Promise<PersistedDailyContent[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 30)
  const result = await db
    .prepare(
      `SELECT ${columns} FROM profile_daily_content
       WHERE profile_id = ? AND content_date < ?
       ORDER BY content_date DESC LIMIT ?`,
    )
    .bind(profileId, contentDate, safeLimit)
    .all<ProfileDailyContentRow>()
  return result.results.map(mapRow)
}

export async function hasUsedProfileComponents(
  db: D1Database,
  profileId: string,
  payload: DailyContentPayload,
): Promise<boolean> {
  const components = await getDailyContentComponents(payload)
  const placeholders = components.map(() => '?').join(', ')
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM profile_daily_content_components
       WHERE profile_id = ? AND component_hash IN (${placeholders}) LIMIT 1`,
    )
    .bind(profileId, ...components.map((item) => item.componentHash))
    .first<{ found: number }>()
  return row?.found === 1
}

export async function listFingerprintsForDate(
  db: D1Database,
  contentDate: string,
): Promise<Set<string>> {
  const result = await db
    .prepare(
      `SELECT fingerprint FROM profile_daily_content WHERE content_date = ?`,
    )
    .bind(contentDate)
    .all<{ fingerprint: string }>()
  return new Set(result.results.map((row) => row.fingerprint))
}

export async function tryInsertProfileDailyContent(input: {
  db: D1Database
  profileId: string
  contentDate: string
  candidate: DailyContentCandidate
  source: DailyContentSource
}): Promise<PersistedDailyContent | undefined> {
  const existing = await getProfileDailyContent(
    input.db,
    input.profileId,
    input.contentDate,
  )
  if (existing) return existing
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const [contentHash, fingerprint, components] = await Promise.all([
    hashPayload(input.candidate.payload),
    computeContentFingerprint(input.candidate.payload),
    getDailyContentComponents(input.candidate.payload),
  ])
  try {
    await input.db.batch([
      input.db
        .prepare(
          `INSERT INTO profile_daily_content (
             id, profile_id, content_date, schema_version, content_json,
             content_hash, source, provider, attribution, generated_at,
             difficulty, theme, origin_type, source_url, fingerprint,
             generator_version, immutable_created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.profileId,
          input.contentDate,
          input.candidate.payload.schemaVersion,
          JSON.stringify(input.candidate.payload),
          contentHash,
          input.source,
          input.candidate.provider,
          input.candidate.attribution,
          createdAt,
          input.candidate.payload.difficulty,
          input.candidate.payload.theme,
          input.candidate.payload.originType,
          input.candidate.sourceUrl ?? null,
          fingerprint,
          input.candidate.payload.generatorVersion,
          createdAt,
        ),
      ...components.map((component) =>
        input.db
          .prepare(
            `INSERT INTO profile_daily_content_components (
               profile_id, component_hash, component_type, normalized_value,
               content_date, content_id, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.profileId,
            component.componentHash,
            component.componentType,
            component.normalizedValue,
            input.contentDate,
            id,
            createdAt,
          ),
      ),
    ])
  } catch {
    return getProfileDailyContent(input.db, input.profileId, input.contentDate)
  }
  return getProfileDailyContent(input.db, input.profileId, input.contentDate)
}
