import type { PersistedDailyContent } from '../repository/daily-content'

export type DailyLearningPackage = {
  date: string
  title: string
  vocabulary: Array<{
    term: string
    phonetic?: string
    partOfSpeech?: string
    chinese: string
    english: string
    example: string
    exampleZh?: string
  }>
  phrases: Array<{
    expression: string
    scenario: string
    chinese: string
    warning: string
  }>
  examples: string[]
  grammarNotes: string[]
  reviewWords: string[]
  contentHash: string
}

type StoredPackage = Omit<DailyLearningPackage, 'contentHash'>

type PackageRow = {
  package_json: string
  content_hash: string
}

function packageFromRow(row: PackageRow): DailyLearningPackage {
  return {
    ...(JSON.parse(row.package_json) as StoredPackage),
    contentHash: row.content_hash,
  }
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

function buildPackage(content: PersistedDailyContent): StoredPackage {
  return {
    date: content.contentDate,
    title: `每日英语学习包 · ${content.contentDate}`,
    vocabulary: content.payload.vocabulary.map((item) => ({
      term: item.term,
      partOfSpeech: item.partOfSpeech,
      chinese: item.definitionZh ?? '结合英文释义与例句理解该词义。',
      english: item.definition,
      example: item.example,
      exampleZh: item.exampleZh,
    })),
    phrases: [
      ...(content.payload.practicalExpressions ?? []).map((item) => ({
        expression: item.expression,
        scenario: item.scenarios.map((scenario) => scenario.label).join('、'),
        chinese: item.chineseMeanings.join(' / '),
        warning: item.pitfalls.join('；'),
      })),
      ...content.payload.sentence.collocations.map((item) => ({
        expression: item.expression,
        scenario: '日常交流或需要自然连接具体观点时',
        chinese: item.meaning,
        warning: '先确认搭配对象和语域，避免逐字翻译。',
      })),
      ...content.payload.sentence.alternatives.map((item) => ({
        expression: item.expression,
        scenario: '需要换一种说法避免重复时',
        chinese: item.note,
        warning: '替换后检查句子结构和语气是否仍然自然。',
      })),
    ],
    examples: [
      content.payload.sentence.english,
      ...content.payload.vocabulary.map((item) => item.example),
    ],
    grammarNotes: [
      ...content.payload.sentence.grammarNotes,
      ...content.payload.sentence.usageNotes,
    ],
    reviewWords: content.payload.vocabulary.map((item) => item.term),
  }
}

export async function getDailyLearningPackage(
  db: D1Database,
  contentDate: string,
): Promise<DailyLearningPackage | undefined> {
  const row = await db
    .prepare(
      `SELECT package_json, content_hash
       FROM daily_learning_packages WHERE content_date = ? LIMIT 1`,
    )
    .bind(contentDate)
    .first<PackageRow>()
  return row ? packageFromRow(row) : undefined
}

export async function ensureDailyLearningPackage(input: {
  db: D1Database
  content: PersistedDailyContent
}): Promise<DailyLearningPackage> {
  const existing = await getDailyLearningPackage(
    input.db,
    input.content.contentDate,
  )
  if (existing) return existing

  const dailyPackage = buildPackage(input.content)
  const semanticHash = await sha256(
    JSON.stringify({
      contentFingerprint: input.content.fingerprint,
      vocabulary: dailyPackage.vocabulary.map((item) => item.term),
      sentence: input.content.payload.sentence.english,
      expressions: dailyPackage.phrases.map((item) => item.expression),
    }),
  )
  const duplicate = await input.db
    .prepare(
      `SELECT content_date FROM daily_learning_packages
       WHERE content_hash = ? AND content_date < ?
       ORDER BY content_date DESC LIMIT 1`,
    )
    .bind(semanticHash, input.content.contentDate)
    .first<{ content_date: string }>()
  if (duplicate) {
    throw new Error('DAILY_PACKAGE_RECENT_DUPLICATE')
  }

  const createdAt = new Date().toISOString()
  await input.db
    .prepare(
      `INSERT INTO daily_learning_packages (
         content_date, content_id, package_json,
         content_hash, created_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(content_date) DO NOTHING`,
    )
    .bind(
      input.content.contentDate,
      input.content.id,
      JSON.stringify(dailyPackage),
      semanticHash,
      createdAt,
    )
    .run()

  const persisted = await getDailyLearningPackage(
    input.db,
    input.content.contentDate,
  )
  if (!persisted) throw new Error('DAILY_PACKAGE_PERSIST_FAILED')
  return persisted
}
