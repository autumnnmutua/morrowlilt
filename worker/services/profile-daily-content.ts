import {
  computeContentFingerprint,
  contentSimilarity,
} from '../content/fingerprint'
import { validateAndSanitizeDailyContentCandidate } from '../content/schema'
import { createSeedCandidates } from '../content/seeds'
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
  tryInsertProfileDailyContent,
} from '../repository/profile-daily-content'
import { practicalExpressionSeedCount } from '../content/practical-expressions'
import { ContentPipelineError } from './daily-content'

const similarityThreshold = 0.82

async function deterministicOffset(
  value: string,
  modulo: number,
): Promise<number> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  const view = new DataView(digest)
  return view.getUint32(0, false) % modulo
}

async function isNovelForProfile(input: {
  db: D1Database
  profileId: string
  candidate: DailyContentCandidate
  recent: PersistedDailyContent[]
  dateFingerprints: Set<string>
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
      contentSimilarity(item.payload, payload) < similarityThreshold,
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
  for (let attempt = 1; attempt <= 2; attempt += 1) {
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
          variationKey: `${input.profileId}:${attempt}`,
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

  const recent = await listRecentProfileDailyContent(
    input.db,
    input.profileId,
    input.contentDate,
    30,
  )
  let dateFingerprints = await listFingerprintsForDate(
    input.db,
    input.contentDate,
  )
  const online = await onlineCandidate({ ...input, recent, dateFingerprints })
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

  const baseOffset = await deterministicOffset(
    `${input.profileId}\u0000${input.contentDate}`,
    practicalExpressionSeedCount,
  )
  for (let attempt = 0; attempt < practicalExpressionSeedCount; attempt += 1) {
    dateFingerprints = await listFingerprintsForDate(
      input.db,
      input.contentDate,
    )
    const candidates = createSeedCandidates(
      input.contentDate,
      baseOffset + attempt,
    )
    const start = await deterministicOffset(
      `${input.profileId}\u0000${input.contentDate}\u0000${attempt}`,
      candidates.length,
    )
    for (let index = 0; index < candidates.length; index += 1) {
      const raw = candidates[(start + index) % candidates.length]
      const candidate = validateAndSanitizeDailyContentCandidate(
        raw,
        input.contentDate,
        raw.provider,
      )
      if (
        !(await isNovelForProfile({
          db: input.db,
          profileId: input.profileId,
          candidate,
          recent,
          dateFingerprints,
        }))
      ) {
        continue
      }
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
