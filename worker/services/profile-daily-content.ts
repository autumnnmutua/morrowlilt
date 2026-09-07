import {
  computeContentFingerprint,
  contentSimilarity,
} from '../content/fingerprint'
import { validateAndSanitizeDailyContentCandidate } from '../content/schema'
import { createSeedCandidate, createSeedCandidates } from '../content/seeds'
import type {
  ContentProvider,
  DailyContentCandidate,
} from '../providers/contracts'
import {
  getDailyContentComponents,
  type PersistedDailyContent,
} from '../repository/daily-content'
import {
  getProfileDailyContent,
  hasUsedProfileComponents,
  listFingerprintsForDate,
  listRecentProfileDailyContent,
  listUsedProfileComponentValues,
  tryInsertProfileDailyContent,
} from '../repository/profile-daily-content'
import {
  practicalExpressionGroup,
  practicalExpressionSeedCount,
} from '../content/practical-expressions'
import { ContentPipelineError } from './daily-content'

const similarityThreshold = 0.82

function deterministicOffset(value: string, modulo: number): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % modulo
}

function normalizeComponent(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
}

async function isNovelForProfile(input: {
  db: D1Database
  profileId: string
  candidate: DailyContentCandidate
  recent: PersistedDailyContent[]
  dateFingerprints: Set<string>
  enforceSimilarity?: boolean
}): Promise<boolean> {
  const payload = input.candidate.payload
  if (
    !payload.practicalExpressions ||
    payload.practicalExpressions.length !== 3 ||
    payload.vocabulary.some(
      (item) =>
        !item.partOfSpeech ||
        !item.definitionZh ||
        !item.exampleZh ||
        !item.usageNote,
    )
  ) {
    return false
  }
  const components = await getDailyContentComponents(payload)
  if (
    new Set(components.map((item) => item.componentHash)).size !==
    components.length
  ) {
    return false
  }
  if (await hasUsedProfileComponents(input.db, input.profileId, payload)) {
    return false
  }
  const fingerprint = await computeContentFingerprint(payload)
  if (input.dateFingerprints.has(fingerprint)) return false
  return input.recent.every(
    (item) =>
      item.fingerprint !== fingerprint &&
      (input.enforceSimilarity === false ||
        contentSimilarity(item.payload, payload) < similarityThreshold),
  )
}

async function onlineCandidate(input: {
  db: D1Database
  profileId: string
  contentDate: string
  timeZone: string
  recent: PersistedDailyContent[]
  dateFingerprints: Set<string>
  onlineProvider?: ContentProvider
}): Promise<DailyContentCandidate | undefined> {
  if (!input.onlineProvider) return undefined
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await input.onlineProvider.generateDailyContent(
        input.contentDate,
        input.timeZone,
        {
          attempt,
          recentFingerprints: input.recent.map((item) => item.fingerprint),
          recentSummaries: input.recent.map((item) => ({
            sentence: item.payload.sentence.english,
            terms: item.payload.vocabulary.map((word) => word.term),
            expressions: (item.payload.practicalExpressions ?? []).map(
              (expression) => expression.expression,
            ),
            topic: item.payload.topic.prompt,
          })),
          regeneration: false,
          // Content is immutable after the first successful insert, so failed
          // provider attempts should not be replayed forever with the same
          // deterministic seed on every Cron invocation.
          variationKey: `${input.profileId}:${attempt}:${crypto.randomUUID()}`,
        },
      )
      const candidate = validateAndSanitizeDailyContentCandidate(
        raw,
        input.contentDate,
        input.onlineProvider.name,
      )
      if (await isNovelForProfile({ ...input, candidate })) return candidate
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'profile_daily_content_online_failed',
          code: 'CONTENT_ONLINE_FAILED',
          contentDate: input.contentDate,
          attempt,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
    }
  }
  return undefined
}

export async function ensureProfileDailyContent(input: {
  db: D1Database
  profileId: string
  contentDate: string
  timeZone: string
  onlineProvider?: ContentProvider
}): Promise<PersistedDailyContent> {
  const existing = await getProfileDailyContent(
    input.db,
    input.profileId,
    input.contentDate,
  )
  if (existing) return existing

  const dateFingerprints = await listFingerprintsForDate(
    input.db,
    input.contentDate,
  )
  if (input.onlineProvider) {
    const recent = await listRecentProfileDailyContent(
      input.db,
      input.profileId,
      input.contentDate,
      30,
    )
    const online = await onlineCandidate({
      ...input,
      recent,
      dateFingerprints,
    })
    if (online) {
      const inserted = await tryInsertProfileDailyContent({
        db: input.db,
        profileId: input.profileId,
        contentDate: input.contentDate,
        candidate: online,
        source: 'online',
      })
      if (inserted) return inserted
    }
  }

  const usedComponents = await listUsedProfileComponentValues(
    input.db,
    input.profileId,
  )
  const baseCandidates = createSeedCandidates(input.contentDate)
  const unusedSeedIndexes = baseCandidates.flatMap((candidate, index) => {
    const values = [
      candidate.payload.sentence.english,
      ...candidate.payload.vocabulary.map((item) => item.term),
    ].map(normalizeComponent)
    return values.every((value) => !usedComponents.has(value)) ? [index] : []
  })
  const unusedExpressionIndexes = Array.from(
    { length: practicalExpressionSeedCount },
    (_, index) => index,
  ).filter((index) =>
    practicalExpressionGroup(index).every(
      (item) => !usedComponents.has(normalizeComponent(item.expression)),
    ),
  )
  if (unusedSeedIndexes.length > 0 && unusedExpressionIndexes.length > 0) {
    const variationKey = `${input.profileId}\u0000${input.contentDate}`
    const seedStart = deterministicOffset(
      variationKey,
      unusedSeedIndexes.length,
    )
    const expressionStart = deterministicOffset(
      `${variationKey}\u0000expressions`,
      unusedExpressionIndexes.length,
    )
    const combinations =
      unusedSeedIndexes.length * unusedExpressionIndexes.length
    const attempts = Math.min(
      combinations,
      Math.max(3, dateFingerprints.size + 1),
    )
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const seedIndex =
        unusedSeedIndexes[(seedStart + attempt) % unusedSeedIndexes.length]
      const expressionIndex =
        unusedExpressionIndexes[
          (expressionStart + Math.floor(attempt / unusedSeedIndexes.length)) %
            unusedExpressionIndexes.length
        ]
      const raw = createSeedCandidate(
        input.contentDate,
        seedIndex,
        expressionIndex,
      )
      const candidate = validateAndSanitizeDailyContentCandidate(
        raw,
        input.contentDate,
        raw.provider,
      )
      const fingerprint = await computeContentFingerprint(candidate.payload)
      if (dateFingerprints.has(fingerprint)) continue
      const inserted = await tryInsertProfileDailyContent({
        db: input.db,
        profileId: input.profileId,
        contentDate: input.contentDate,
        candidate,
        source: 'seed',
      })
      if (inserted) return inserted
    }
  }

  throw new ContentPipelineError(
    'PROFILE_CONTENT_NOVELTY_EXHAUSTED',
    'No distinct learning package is currently available for this learner',
    503,
  )
}
