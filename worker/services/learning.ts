import { isContentDate } from '../content/schema'
import type { ContentProvider } from '../providers/contracts'
import { listProfileDailyContentRange } from '../repository/profile-daily-content'
import {
  createProfileIfMissing,
  getCheckinEventByKey,
  getLatestUndoableLearnedEvent,
  getLearningProgress,
  getProfile,
  type AppProfile,
  type CheckinEvent,
  type CheckinEventType,
  type LearningProgress,
} from '../repository/learning'
import {
  addLocalDays,
  assertIanaTimeZone,
  getLocalDate,
  listLocalDatesExclusiveInclusive,
} from '../time/business-date'
import { ensureProfileDailyContent } from './profile-daily-content'

export class LearningDomainError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 409) {
    super(message)
    this.name = 'LearningDomainError'
    this.code = code
    this.status = status
  }
}

export type PendingBundle = {
  profile: AppProfile
  progress: LearningProgress
  today: string
  learningState: 'settled' | 'unsettled'
  pendingDayCount: number
  totalItemCount: number
  days: Awaited<ReturnType<typeof listProfileDailyContentRange>>
}

export type CheckinMutationResult = {
  changed: boolean
  idempotent: boolean
  event?: CheckinEvent
  progress: LearningProgress
}

function assertMutationInput(
  profileId: string,
  today: string,
  idempotencyKey: string,
): void {
  if (!profileId || profileId.length > 128) {
    throw new LearningDomainError(
      'INVALID_PROFILE_ID',
      'Invalid profile id',
      400,
    )
  }
  if (!isContentDate(today)) {
    throw new LearningDomainError(
      'INVALID_BUSINESS_DATE',
      'Invalid business date',
      400,
    )
  }
  if (!/^[A-Za-z0-9._:/-]{8,128}$/.test(idempotencyKey)) {
    throw new LearningDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Invalid idempotency key',
      400,
    )
  }
}

async function validateEventReplay(
  db: D1Database,
  profileId: string,
  today: string,
  idempotencyKey: string,
  expectedType: CheckinEventType,
): Promise<CheckinMutationResult | undefined> {
  const existing = await getCheckinEventByKey(db, profileId, idempotencyKey)
  if (!existing) return undefined
  if (existing.eventType !== expectedType || existing.businessDate !== today) {
    throw new LearningDomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used for a different operation',
    )
  }
  return {
    changed: false,
    idempotent: true,
    event: existing,
    progress: await getLearningProgress(db, profileId),
  }
}

async function requireProfileAndProgress(
  db: D1Database,
  profileId: string,
  today: string,
): Promise<{ profile: AppProfile; progress: LearningProgress }> {
  const profile = await getProfile(db, profileId)
  if (!profile) {
    throw new LearningDomainError('PROFILE_NOT_FOUND', 'Profile not found', 404)
  }
  const progress = await getLearningProgress(db, profileId)
  if (today < profile.createdDate) {
    throw new LearningDomainError(
      'DATE_BEFORE_PROFILE',
      'Business date cannot precede profile creation',
      400,
    )
  }
  if (today < progress.settledThroughDate) {
    throw new LearningDomainError(
      'DATE_BEFORE_SETTLED',
      'Business date cannot move behind the settled boundary',
    )
  }
  return { profile, progress }
}

export async function ensureAppProfile(input: {
  db: D1Database
  profileId: string
  timeZone: string
  now?: number | Date
}): Promise<AppProfile> {
  assertIanaTimeZone(input.timeZone)
  const createdDate = getLocalDate(input.timeZone, input.now)
  return createProfileIfMissing(input.db, {
    profileId: input.profileId,
    timeZone: input.timeZone,
    createdDate,
  })
}

export async function getPendingBundle(input: {
  db: D1Database
  profileId: string
  today: string
  onlineProvider?: ContentProvider
  profile?: AppProfile
}): Promise<PendingBundle> {
  if (!isContentDate(input.today)) {
    throw new LearningDomainError(
      'INVALID_BUSINESS_DATE',
      'Invalid business date',
      400,
    )
  }
  const [profile, progress] = await Promise.all([
    input.profile
      ? Promise.resolve(input.profile)
      : getProfile(input.db, input.profileId),
    getLearningProgress(input.db, input.profileId),
  ])
  if (!profile) {
    throw new LearningDomainError('PROFILE_NOT_FOUND', 'Profile not found', 404)
  }
  if (input.today < profile.createdDate) {
    throw new LearningDomainError(
      'DATE_BEFORE_PROFILE',
      'Business date cannot precede profile creation',
      400,
    )
  }

  const pendingDates = listLocalDatesExclusiveInclusive(
    progress.settledThroughDate,
    input.today,
  )
  const existingDays = await listProfileDailyContentRange(
    input.db,
    input.profileId,
    progress.settledThroughDate,
    input.today,
  )
  const existingDates = new Set(existingDays.map((day) => day.contentDate))
  const missingDates = pendingDates.filter((date) => !existingDates.has(date))

  for (const contentDate of missingDates) {
    await ensureProfileDailyContent({
      db: input.db,
      profileId: input.profileId,
      contentDate,
      timeZone: profile.timeZone,
      onlineProvider: input.onlineProvider,
    })
  }

  const days =
    missingDates.length === 0
      ? existingDays
      : await listProfileDailyContentRange(
          input.db,
          input.profileId,
          progress.settledThroughDate,
          input.today,
        )
  return {
    profile,
    progress,
    today: input.today,
    learningState:
      progress.settledThroughDate === input.today ? 'settled' : 'unsettled',
    pendingDayCount: days.length,
    totalItemCount: days.reduce(
      (total, day) =>
        total +
        day.payload.vocabulary.length +
        (day.payload.practicalExpressions?.length ?? 0) +
        2,
      0,
    ),
    days,
  }
}

export async function markLearned(input: {
  db: D1Database
  profileId: string
  today: string
  idempotencyKey: string
}): Promise<CheckinMutationResult> {
  assertMutationInput(input.profileId, input.today, input.idempotencyKey)
  const replay = await validateEventReplay(
    input.db,
    input.profileId,
    input.today,
    input.idempotencyKey,
    'learned',
  )
  if (replay) return replay
  const { progress } = await requireProfileAndProgress(
    input.db,
    input.profileId,
    input.today,
  )
  if (progress.settledThroughDate === input.today) {
    return { changed: false, idempotent: false, progress }
  }

  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()
  const results = await input.db.batch([
    input.db
      .prepare(
        `INSERT INTO checkin_events (
           id, profile_id, business_date, event_type,
           previous_settled_date, resulting_settled_date,
           reverses_event_id, idempotency_key, created_at
         )
         SELECT ?, progress.profile_id, ?, 'learned',
                progress.settled_through_date, ?, NULL, ?, ?
         FROM learning_progress AS progress
         JOIN app_profile AS profile ON profile.id = progress.profile_id
         WHERE progress.profile_id = ?
           AND progress.settled_through_date < ?
           AND profile.created_date <= ?
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        eventId,
        input.today,
        input.today,
        input.idempotencyKey,
        now,
        input.profileId,
        input.today,
        input.today,
      ),
    input.db
      .prepare(
        `UPDATE learning_progress
         SET settled_through_date = ?, version = version + 1, updated_at = ?
         WHERE profile_id = ?
           AND settled_through_date < ?
           AND EXISTS (
             SELECT 1 FROM checkin_events WHERE id = ?
           )`,
      )
      .bind(input.today, now, input.profileId, input.today, eventId),
  ])

  const changed = (results[1].meta.changes ?? 0) === 1
  const event = await getCheckinEventByKey(
    input.db,
    input.profileId,
    input.idempotencyKey,
  )
  return {
    changed,
    idempotent: !changed && event !== undefined,
    event,
    progress: await getLearningProgress(input.db, input.profileId),
  }
}

export async function markNotLearned(input: {
  db: D1Database
  profileId: string
  today: string
  idempotencyKey: string
}): Promise<CheckinMutationResult> {
  assertMutationInput(input.profileId, input.today, input.idempotencyKey)
  const replay = await validateEventReplay(
    input.db,
    input.profileId,
    input.today,
    input.idempotencyKey,
    'not_learned',
  )
  if (replay) return replay
  const { progress } = await requireProfileAndProgress(
    input.db,
    input.profileId,
    input.today,
  )
  if (progress.settledThroughDate === input.today) {
    throw new LearningDomainError(
      'ALREADY_SETTLED_USE_UNDO',
      'Today is settled; use the same-day undo operation',
    )
  }

  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await input.db
    .prepare(
      `INSERT INTO checkin_events (
         id, profile_id, business_date, event_type,
         previous_settled_date, resulting_settled_date,
         reverses_event_id, idempotency_key, created_at
       )
       SELECT ?, progress.profile_id, ?, 'not_learned',
              progress.settled_through_date,
              progress.settled_through_date, NULL, ?, ?
       FROM learning_progress AS progress
       JOIN app_profile AS profile ON profile.id = progress.profile_id
       WHERE progress.profile_id = ?
         AND progress.settled_through_date < ?
         AND profile.created_date <= ?
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      eventId,
      input.today,
      input.idempotencyKey,
      now,
      input.profileId,
      input.today,
      input.today,
    )
    .run()

  return {
    changed: false,
    idempotent: (result.meta.changes ?? 0) === 0,
    event: await getCheckinEventByKey(
      input.db,
      input.profileId,
      input.idempotencyKey,
    ),
    progress: await getLearningProgress(input.db, input.profileId),
  }
}

export async function undoTodayLearned(input: {
  db: D1Database
  profileId: string
  today: string
  idempotencyKey: string
}): Promise<CheckinMutationResult> {
  assertMutationInput(input.profileId, input.today, input.idempotencyKey)
  const replay = await validateEventReplay(
    input.db,
    input.profileId,
    input.today,
    input.idempotencyKey,
    'undo',
  )
  if (replay) return replay
  const { progress } = await requireProfileAndProgress(
    input.db,
    input.profileId,
    input.today,
  )
  if (progress.settledThroughDate !== input.today) {
    throw new LearningDomainError(
      'NO_UNDOABLE_TODAY_LEARNED',
      'There is no learned event to undo on this business day',
    )
  }
  const learned = await getLatestUndoableLearnedEvent(
    input.db,
    input.profileId,
    input.today,
  )
  if (!learned) {
    throw new LearningDomainError(
      'NO_UNDOABLE_TODAY_LEARNED',
      'There is no learned event to undo on this business day',
    )
  }

  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()
  const results = await input.db.batch([
    input.db
      .prepare(
        `INSERT INTO checkin_events (
           id, profile_id, business_date, event_type,
           previous_settled_date, resulting_settled_date,
           reverses_event_id, idempotency_key, created_at
         )
         SELECT ?, progress.profile_id, ?, 'undo', ?, ?, ?, ?, ?
         FROM learning_progress AS progress
         WHERE progress.profile_id = ?
           AND progress.settled_through_date = ?
           AND NOT EXISTS (
             SELECT 1 FROM checkin_events
             WHERE reverses_event_id = ?
           )
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        eventId,
        input.today,
        input.today,
        learned.previousSettledDate,
        learned.id,
        input.idempotencyKey,
        now,
        input.profileId,
        input.today,
        learned.id,
      ),
    input.db
      .prepare(
        `UPDATE learning_progress
         SET settled_through_date = ?, version = version + 1, updated_at = ?
         WHERE profile_id = ?
           AND settled_through_date = ?
           AND EXISTS (
             SELECT 1 FROM checkin_events WHERE id = ?
           )`,
      )
      .bind(
        learned.previousSettledDate,
        now,
        input.profileId,
        input.today,
        eventId,
      ),
  ])

  const changed = (results[1].meta.changes ?? 0) === 1
  if (!changed) {
    const concurrentReplay = await validateEventReplay(
      input.db,
      input.profileId,
      input.today,
      input.idempotencyKey,
      'undo',
    )
    if (concurrentReplay) return concurrentReplay
    throw new LearningDomainError(
      'CONCURRENT_STATE_CHANGED',
      'Learning state changed concurrently; refresh and try again',
    )
  }
  return {
    changed,
    idempotent: false,
    event: await getCheckinEventByKey(
      input.db,
      input.profileId,
      input.idempotencyKey,
    ),
    progress: await getLearningProgress(input.db, input.profileId),
  }
}

export function previousLocalDate(date: string): string {
  return addLocalDays(date, -1)
}
