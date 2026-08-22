export type AppProfile = {
  id: string
  timeZone: string
  learningTrack: 'academic' | 'general'
  createdDate: string
  createdAt: string
}

export type LearningProgress = {
  profileId: string
  settledThroughDate: string
  version: number
  updatedAt: string
}

export type CheckinEventType = 'learned' | 'not_learned' | 'undo'

export type CheckinEvent = {
  id: string
  profileId: string
  businessDate: string
  eventType: CheckinEventType
  previousSettledDate: string
  resultingSettledDate: string
  reversesEventId?: string
  idempotencyKey: string
  createdAt: string
}

type ProfileRow = {
  id: string
  time_zone: string
  learning_track: 'academic' | 'general'
  created_date: string
  created_at: string
}

type ProgressRow = {
  profile_id: string
  settled_through_date: string
  version: number
  updated_at: string
}

type EventRow = {
  id: string
  profile_id: string
  business_date: string
  event_type: CheckinEventType
  previous_settled_date: string
  resulting_settled_date: string
  reverses_event_id: string | null
  idempotency_key: string
  created_at: string
}

function mapProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    timeZone: row.time_zone,
    learningTrack: row.learning_track,
    createdDate: row.created_date,
    createdAt: row.created_at,
  }
}

function mapProgress(row: ProgressRow): LearningProgress {
  return {
    profileId: row.profile_id,
    settledThroughDate: row.settled_through_date,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function mapEvent(row: EventRow): CheckinEvent {
  return {
    id: row.id,
    profileId: row.profile_id,
    businessDate: row.business_date,
    eventType: row.event_type,
    previousSettledDate: row.previous_settled_date,
    resultingSettledDate: row.resulting_settled_date,
    reversesEventId: row.reverses_event_id ?? undefined,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  }
}

export async function getProfile(
  db: D1Database,
  profileId: string,
): Promise<AppProfile | undefined> {
  const row = await db
    .prepare(
      `SELECT id, time_zone, learning_track, created_date, created_at
       FROM app_profile WHERE id = ? LIMIT 1`,
    )
    .bind(profileId)
    .first<ProfileRow>()
  return row ? mapProfile(row) : undefined
}

export async function updateLearningTrack(
  db: D1Database,
  profileId: string,
  track: 'academic' | 'general',
): Promise<AppProfile> {
  await db
    .prepare(
      `UPDATE app_profile
       SET learning_track = ?, updated_at = ?
       WHERE id = ? AND learning_track <> ?`,
    )
    .bind(track, new Date().toISOString(), profileId, track)
    .run()
  const profile = await getProfile(db, profileId)
  if (!profile) throw new Error('Profile not found after track update')
  return profile
}

export async function updateProfileTimeZone(
  db: D1Database,
  profileId: string,
  timeZone: string,
): Promise<AppProfile> {
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE app_profile SET time_zone = ?, updated_at = ?
         WHERE id = ? AND time_zone <> ?`,
      )
      .bind(timeZone, now, profileId, timeZone),
    db
      .prepare(
        `UPDATE users SET timezone = ?, updated_at = ?
         WHERE profile_id = ? AND timezone <> ?`,
      )
      .bind(timeZone, now, profileId, timeZone),
  ])
  const profile = await getProfile(db, profileId)
  if (!profile) throw new Error('Profile not found after timezone update')
  return profile
}

export async function createProfileIfMissing(
  db: D1Database,
  input: {
    profileId: string
    timeZone: string
    createdDate: string
  },
): Promise<AppProfile> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO app_profile (
         id, time_zone, created_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(input.profileId, input.timeZone, input.createdDate, now, now)
    .run()
  const profile = await getProfile(db, input.profileId)
  if (!profile) throw new Error('Profile could not be created')
  return profile
}

export async function getLearningProgress(
  db: D1Database,
  profileId: string,
): Promise<LearningProgress> {
  const row = await db
    .prepare(
      `SELECT profile_id, settled_through_date, version, updated_at
       FROM learning_progress WHERE profile_id = ? LIMIT 1`,
    )
    .bind(profileId)
    .first<ProgressRow>()
  if (!row) throw new Error('Learning progress was not initialized')
  return mapProgress(row)
}

export async function getCheckinEventByKey(
  db: D1Database,
  profileId: string,
  idempotencyKey: string,
): Promise<CheckinEvent | undefined> {
  const row = await db
    .prepare(
      `SELECT id, profile_id, business_date, event_type,
              previous_settled_date, resulting_settled_date,
              reverses_event_id, idempotency_key, created_at
       FROM checkin_events
       WHERE profile_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(profileId, idempotencyKey)
    .first<EventRow>()
  return row ? mapEvent(row) : undefined
}

export async function getLatestUndoableLearnedEvent(
  db: D1Database,
  profileId: string,
  businessDate: string,
): Promise<CheckinEvent | undefined> {
  const row = await db
    .prepare(
      `SELECT learned.id, learned.profile_id, learned.business_date,
              learned.event_type, learned.previous_settled_date,
              learned.resulting_settled_date, learned.reverses_event_id,
              learned.idempotency_key, learned.created_at
       FROM checkin_events AS learned
       WHERE learned.profile_id = ?
         AND learned.business_date = ?
         AND learned.event_type = 'learned'
         AND NOT EXISTS (
           SELECT 1 FROM checkin_events AS undo
           WHERE undo.reverses_event_id = learned.id
         )
       ORDER BY learned.created_at DESC, learned.id DESC
       LIMIT 1`,
    )
    .bind(profileId, businessDate)
    .first<EventRow>()
  return row ? mapEvent(row) : undefined
}
