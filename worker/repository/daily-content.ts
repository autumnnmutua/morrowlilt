import { parseDailyContentPayload } from '../content/schema'
import { computeContentFingerprint } from '../content/fingerprint'
import type {
  DailyContentCandidate,
  DailyContentPayload,
} from '../providers/contracts'

export type DailyContentSource = 'online' | 'cache' | 'seed'

export type PersistedDailyContent = {
  id: string
  contentDate: string
  payload: DailyContentPayload
  contentHash: string
  source: DailyContentSource
  sourceDate?: string
  provider: string
  attribution: string
  generatedAt: string
  difficulty: DailyContentPayload['difficulty']
  theme: DailyContentPayload['theme']
  originType: DailyContentPayload['originType']
  sourceUrl?: string
  fingerprint: string
  generatorVersion: string
  createdAt: string
}

type DailyContentRow = {
  id: string
  content_date: string
  content_json: string
  content_hash: string
  source: DailyContentSource
  source_date: string | null
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

function mapRow(row: DailyContentRow): PersistedDailyContent {
  return {
    id: row.id,
    contentDate: row.content_date,
    payload: parseDailyContentPayload(row.content_json),
    contentHash: row.content_hash,
    source: row.source,
    sourceDate: row.source_date ?? undefined,
    provider: row.provider,
    attribution: row.attribution,
    generatedAt: row.generated_at,
    difficulty: row.difficulty,
    theme: row.theme,
    originType: row.origin_type,
    sourceUrl: row.source_url ?? undefined,
    fingerprint: row.fingerprint,
    generatorVersion: row.generator_version,
    createdAt: row.immutable_created_at || row.generated_at,
  }
}

const dailyContentColumns = `id, content_date, content_json, content_hash, source,
  source_date, provider, attribution, generated_at, difficulty, theme,
  origin_type, source_url, fingerprint, generator_version, immutable_created_at`

export async function getDailyContent(
  db: D1Database,
  contentDate: string,
): Promise<PersistedDailyContent | undefined> {
  const row = await db
    .prepare(
      `SELECT ${dailyContentColumns}
       FROM daily_content WHERE content_date = ? LIMIT 1`,
    )
    .bind(contentDate)
    .first<DailyContentRow>()
  return row ? mapRow(row) : undefined
}

export async function getLatestDailyContentBefore(
  db: D1Database,
  contentDate: string,
): Promise<PersistedDailyContent | undefined> {
  const row = await db
    .prepare(
      `SELECT ${dailyContentColumns}
       FROM daily_content
       WHERE content_date < ?
       ORDER BY content_date DESC LIMIT 1`,
    )
    .bind(contentDate)
    .first<DailyContentRow>()
  return row ? mapRow(row) : undefined
}

export async function listDailyContentRange(
  db: D1Database,
  startExclusive: string,
  endInclusive: string,
): Promise<PersistedDailyContent[]> {
  const result = await db
    .prepare(
      `SELECT ${dailyContentColumns}
       FROM daily_content
       WHERE content_date > ? AND content_date <= ?
       ORDER BY content_date ASC`,
    )
    .bind(startExclusive, endInclusive)
    .all<DailyContentRow>()
  return result.results.map(mapRow)
}

async function hashPayload(payload: DailyContentPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

type DailyContentComponent = {
  componentHash: string
  componentType: 'sentence' | 'vocabulary' | 'practical_expression'
  normalizedValue: string
}

function normalizeComponent(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
}

async function hashComponent(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getDailyContentComponents(
  payload: DailyContentPayload,
): Promise<DailyContentComponent[]> {
  const values: Array<{
    componentType: DailyContentComponent['componentType']
    value: string
  }> = [
    { componentType: 'sentence', value: payload.sentence.english },
    ...payload.vocabulary.map((item) => ({
      componentType: 'vocabulary' as const,
      value: item.term,
    })),
    ...(payload.practicalExpressions ?? []).map((item) => ({
      componentType: 'practical_expression' as const,
      value: item.expression,
    })),
  ]
  return Promise.all(
    values.map(async ({ componentType, value }) => {
      const normalizedValue = normalizeComponent(value)
      return {
        componentHash: await hashComponent(normalizedValue),
        componentType,
        normalizedValue,
      }
    }),
  )
}

export async function listUsedDailyContentComponentHashes(
  db: D1Database,
  payload: DailyContentPayload,
): Promise<Set<string>> {
  const components = await getDailyContentComponents(payload)
  const placeholders = components.map(() => '?').join(', ')
  const result = await db
    .prepare(
      `SELECT component_hash
       FROM daily_content_components
       WHERE component_hash IN (${placeholders})`,
    )
    .bind(...components.map((item) => item.componentHash))
    .all<{ component_hash: string }>()
  return new Set(result.results.map((item) => item.component_hash))
}

export async function backfillDailyContentComponentRegistry(
  db: D1Database,
): Promise<void> {
  const result = await db
    .prepare(
      `SELECT ${dailyContentColumns}
       FROM daily_content AS content
       WHERE NOT EXISTS (
         SELECT 1 FROM daily_content_components AS component
         WHERE component.content_date = content.content_date
       )
       ORDER BY content.content_date ASC`,
    )
    .all<DailyContentRow>()
  for (const row of result.results) {
    const persisted = mapRow(row)
    const components = await getDailyContentComponents(persisted.payload)
    if (components.length === 0) continue
    await db.batch(
      components.map((component) =>
        db
          .prepare(
            `INSERT INTO daily_content_components (
               component_hash, component_type, normalized_value, content_date, created_at
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(component_hash) DO NOTHING`,
          )
          .bind(
            component.componentHash,
            component.componentType,
            component.normalizedValue,
            persisted.contentDate,
            persisted.createdAt,
          ),
      ),
    )
  }
}

export async function listRecentDailyContentBefore(
  db: D1Database,
  contentDate: string,
  limit = 14,
): Promise<PersistedDailyContent[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 30)
  const result = await db
    .prepare(
      `SELECT ${dailyContentColumns}
       FROM daily_content
       WHERE content_date < ?
       ORDER BY content_date DESC LIMIT ?`,
    )
    .bind(contentDate, safeLimit)
    .all<DailyContentRow>()
  return result.results.map(mapRow)
}

export async function insertDailyContent(
  db: D1Database,
  input: {
    contentDate: string
    candidate: DailyContentCandidate
    source: DailyContentSource
    sourceDate?: string
  },
): Promise<PersistedDailyContent> {
  const id = crypto.randomUUID()
  const generatedAt = new Date().toISOString()
  const [contentHash, fingerprint] = await Promise.all([
    hashPayload(input.candidate.payload),
    computeContentFingerprint(input.candidate.payload),
  ])
  const components = await getDailyContentComponents(input.candidate.payload)

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO daily_content (
         id, content_date, schema_version, content_json, content_hash,
         source, source_date, provider, provider_version, attribution, generated_at,
         difficulty, theme, origin_type, source_url, fingerprint,
         generator_version, immutable_created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_date) DO NOTHING`,
        )
        .bind(
          id,
          input.contentDate,
          input.candidate.payload.schemaVersion,
          JSON.stringify(input.candidate.payload),
          contentHash,
          input.source,
          input.sourceDate ?? null,
          input.candidate.provider,
          input.candidate.payload.generatorVersion,
          input.candidate.attribution,
          generatedAt,
          input.candidate.payload.difficulty,
          input.candidate.payload.theme,
          input.candidate.payload.originType,
          input.candidate.sourceUrl ?? null,
          fingerprint,
          input.candidate.payload.generatorVersion,
          generatedAt,
        ),
      ...components.map((component) =>
        db
          .prepare(
            `INSERT INTO daily_content_components (
               component_hash, component_type, normalized_value, content_date, created_at
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            component.componentHash,
            component.componentType,
            component.normalizedValue,
            input.contentDate,
            generatedAt,
          ),
      ),
    ])
  } catch (error) {
    const concurrent = await getDailyContent(db, input.contentDate)
    if (concurrent) return concurrent
    throw error
  }

  const persisted = await getDailyContent(db, input.contentDate)
  if (!persisted) throw new Error('Daily content could not be persisted')
  return persisted
}

export async function regenerateDailyContent(
  db: D1Database,
  input: {
    contentDate: string
    candidate: DailyContentCandidate
    reason: string
    idempotencyKey: string
    source: DailyContentSource
  },
): Promise<PersistedDailyContent> {
  const existing = await getDailyContent(db, input.contentDate)
  if (!existing) throw new Error('Daily content must exist before regeneration')
  const regeneratedAt = new Date().toISOString()
  const replacementJson = JSON.stringify(input.candidate.payload)
  const [replacementHash, replacementFingerprint] = await Promise.all([
    hashPayload(input.candidate.payload),
    computeContentFingerprint(input.candidate.payload),
  ])
  const replacementComponents = await getDailyContentComponents(
    input.candidate.payload,
  )
  const auditId = crypto.randomUUID()

  await db.batch([
    db
      .prepare(
        `INSERT INTO daily_content_revision_audit (
           id, content_date, previous_content_json, previous_content_hash,
           previous_fingerprint, previous_provider, replacement_content_json,
           replacement_content_hash, replacement_fingerprint,
           replacement_provider, reason, idempotency_key, regenerated_at
         )
         SELECT ?, content_date, content_json, content_hash, fingerprint,
                provider, ?, ?, ?, ?, ?, ?, ?
         FROM daily_content
         WHERE content_date = ?
           AND NOT EXISTS (
             SELECT 1 FROM daily_content_revision_audit
             WHERE content_date = ? AND idempotency_key = ?
           )
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        auditId,
        replacementJson,
        replacementHash,
        replacementFingerprint,
        input.candidate.provider,
        input.reason,
        input.idempotencyKey,
        regeneratedAt,
        input.contentDate,
        input.contentDate,
        input.idempotencyKey,
      ),
    db
      .prepare(
        `UPDATE daily_content
         SET schema_version = ?, content_json = ?, content_hash = ?,
             source = ?, source_date = NULL, provider = ?,
             provider_version = ?, attribution = ?, generated_at = ?,
             difficulty = ?, theme = ?, origin_type = ?, source_url = ?,
             fingerprint = ?, generator_version = ?
         WHERE content_date = ?
           AND EXISTS (
             SELECT 1 FROM daily_content_revision_audit WHERE id = ?
           )`,
      )
      .bind(
        input.candidate.payload.schemaVersion,
        replacementJson,
        replacementHash,
        input.source,
        input.candidate.provider,
        input.candidate.payload.generatorVersion,
        input.candidate.attribution,
        regeneratedAt,
        input.candidate.payload.difficulty,
        input.candidate.payload.theme,
        input.candidate.payload.originType,
        input.candidate.sourceUrl ?? null,
        replacementFingerprint,
        input.candidate.payload.generatorVersion,
        input.contentDate,
        auditId,
      ),
    ...replacementComponents.map((component) =>
      db
        .prepare(
          `INSERT INTO daily_content_components (
             component_hash, component_type, normalized_value, content_date, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          component.componentHash,
          component.componentType,
          component.normalizedValue,
          input.contentDate,
          regeneratedAt,
        ),
    ),
  ])

  const regenerated = await getDailyContent(db, input.contentDate)
  if (!regenerated) throw new Error('Regenerated content could not be read')
  return regenerated
}

export async function checkDatabase(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>()
  return row?.ok === 1
}
