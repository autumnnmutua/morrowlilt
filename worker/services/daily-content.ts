import {
  computeContentFingerprint,
  contentSimilarity,
  secureRandomIndex,
} from '../content/fingerprint'
import { validateAndSanitizeDailyContentCandidate } from '../content/schema'
import { createSeedCandidates } from '../content/seeds'
import type {
  ContentProvider,
  DailyContentCandidate,
} from '../providers/contracts'
import {
  backfillDailyContentComponentRegistry,
  getDailyContent,
  getDailyContentComponents,
  insertDailyContent,
  listUsedDailyContentComponentHashes,
  listRecentDailyContentBefore,
  regenerateDailyContent,
  type PersistedDailyContent,
} from '../repository/daily-content'

const recentWindow = 30
const maxOnlineGenerationAttempts = 2
const similarityThreshold = 0.82

export class ContentPipelineError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ContentPipelineError'
    this.code = code
    this.status = status
  }
}

async function isNovelCandidate(
  db: D1Database,
  candidate: DailyContentCandidate,
  recent: PersistedDailyContent[],
): Promise<boolean> {
  if (
    !candidate.payload.practicalExpressions ||
    candidate.payload.practicalExpressions.length !== 3 ||
    candidate.payload.vocabulary.some(
      (item) =>
        !item.partOfSpeech ||
        !item.definitionZh ||
        !item.exampleZh ||
        !item.usageNote,
    )
  ) {
    return false
  }
  const components = await getDailyContentComponents(candidate.payload)
  if (
    new Set(components.map((item) => item.componentHash)).size !==
    components.length
  ) {
    return false
  }
  if (
    (await listUsedDailyContentComponentHashes(db, candidate.payload)).size > 0
  ) {
    return false
  }
  const fingerprint = await computeContentFingerprint(candidate.payload)
  const candidateTerms = new Set(
    candidate.payload.vocabulary.map((item) => item.term.toLowerCase()),
  )
  const candidateExpressions = new Set(
    candidate.payload.practicalExpressions.map((item) =>
      item.expression.toLowerCase(),
    ),
  )
  return recent.every(
    (item) =>
      item.fingerprint !== fingerprint &&
      item.payload.sentence.english.toLowerCase() !==
        candidate.payload.sentence.english.toLowerCase() &&
      !item.payload.vocabulary.some((word) =>
        candidateTerms.has(word.term.toLowerCase()),
      ) &&
      !(item.payload.practicalExpressions ?? []).some((expression) =>
        candidateExpressions.has(expression.expression.toLowerCase()),
      ) &&
      contentSimilarity(item.payload, candidate.payload) < similarityThreshold,
  )
}

async function generateCandidate(input: {
  db: D1Database
  contentDate: string
  timeZone: string
  onlineProvider?: ContentProvider
  regeneration: boolean
}): Promise<{ candidate: DailyContentCandidate; source: 'online' | 'seed' }> {
  await backfillDailyContentComponentRegistry(input.db)
  const recent = await listRecentDailyContentBefore(
    input.db,
    input.contentDate,
    recentWindow,
  )
  if (input.regeneration) {
    const current = await getDailyContent(input.db, input.contentDate)
    if (current) recent.unshift(current)
  }
  const recentFingerprints = recent.map((item) => item.fingerprint)

  if (input.onlineProvider) {
    for (
      let attempt = 1;
      attempt <= maxOnlineGenerationAttempts;
      attempt += 1
    ) {
      try {
        const rawCandidate = await input.onlineProvider.generateDailyContent(
          input.contentDate,
          input.timeZone,
          {
            attempt,
            recentFingerprints,
            recentSummaries: recent.map((item) => ({
              sentence: item.payload.sentence.english,
              terms: item.payload.vocabulary.map((word) => word.term),
              expressions: (item.payload.practicalExpressions ?? []).map(
                (expression) => expression.expression,
              ),
              topic: item.payload.topic.prompt,
            })),
            regeneration: input.regeneration,
          },
        )
        const candidate = validateAndSanitizeDailyContentCandidate(
          rawCandidate,
          input.contentDate,
          input.onlineProvider.name,
        )
        if (await isNovelCandidate(input.db, candidate, recent)) {
          return { candidate, source: 'online' }
        }
        console.warn(
          JSON.stringify({
            event: 'daily_content_candidate_rejected',
            code: 'CONTENT_RECENTLY_SIMILAR',
            provider: input.onlineProvider.name,
            contentDate: input.contentDate,
            attempt,
          }),
        )
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'daily_content_online_failed',
            code:
              error instanceof Error && 'code' in error
                ? String(error.code)
                : 'CONTENT_ONLINE_FAILED',
            provider: input.onlineProvider.name,
            contentDate: input.contentDate,
            attempt,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }),
        )
      }
    }
  }

  const seeds = createSeedCandidates(input.contentDate).map((candidate) =>
    validateAndSanitizeDailyContentCandidate(
      candidate,
      input.contentDate,
      candidate.provider,
    ),
  )
  const novelSeeds: DailyContentCandidate[] = []
  for (const seed of seeds) {
    if (await isNovelCandidate(input.db, seed, recent)) novelSeeds.push(seed)
  }
  const notYesterday = seeds.filter(
    (seed) =>
      !recent[0] ||
      contentSimilarity(seed.payload, recent[0].payload) < similarityThreshold,
  )
  if (novelSeeds.length === 0 && input.onlineProvider && recent.length > 0) {
    throw new ContentPipelineError(
      'CONTENT_NOVELTY_EXHAUSTED',
      'No non-repeating daily content is currently available',
      503,
    )
  }
  const eligible = novelSeeds.length > 0 ? novelSeeds : notYesterday
  const candidatePool = eligible.length > 0 ? eligible : seeds
  return {
    candidate: candidatePool[secureRandomIndex(candidatePool.length)],
    source: 'seed',
  }
}

export async function previewDailyContent(input: {
  db: D1Database
  contentDate: string
  timeZone: string
  onlineProvider?: ContentProvider
  regeneration?: boolean
}): Promise<{ candidate: DailyContentCandidate; source: 'online' | 'seed' }> {
  return generateCandidate({
    ...input,
    regeneration: input.regeneration ?? false,
  })
}

export async function ensureDailyContent(input: {
  db: D1Database
  contentDate: string
  timeZone: string
  onlineProvider?: ContentProvider
}): Promise<PersistedDailyContent> {
  const existing = await getDailyContent(input.db, input.contentDate)
  if (existing) return existing

  const generated = await generateCandidate({ ...input, regeneration: false })
  return insertDailyContent(input.db, {
    contentDate: input.contentDate,
    candidate: generated.candidate,
    source: generated.source,
  })
}

export async function regenerateDailyContentWithAudit(input: {
  db: D1Database
  contentDate: string
  timeZone: string
  reason: string
  idempotencyKey: string
  onlineProvider?: ContentProvider
}): Promise<PersistedDailyContent> {
  const existing = await getDailyContent(input.db, input.contentDate)
  if (!existing) {
    throw new ContentPipelineError(
      'CONTENT_NOT_FOUND',
      'Administrator regeneration requires an existing daily snapshot',
      404,
    )
  }
  const generated = await generateCandidate({ ...input, regeneration: true })
  return regenerateDailyContent(input.db, {
    contentDate: input.contentDate,
    candidate: generated.candidate,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    source: generated.source,
  })
}
