ALTER TABLE app_profile
  ADD COLUMN learning_track TEXT NOT NULL DEFAULT 'academic'
  CHECK (learning_track IN ('academic', 'general'));

CREATE TABLE daily_topics (
  id TEXT PRIMARY KEY,
  content_date TEXT NOT NULL
    CHECK (
      content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', content_date) = content_date
    ),
  track TEXT NOT NULL CHECK (track IN ('academic', 'general')),
  kind TEXT NOT NULL CHECK (kind IN ('speaking', 'writing')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  source TEXT NOT NULL CHECK (source IN ('online', 'seed')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 100),
  attribution TEXT NOT NULL CHECK (length(attribution) BETWEEN 1 AND 300),
  source_url TEXT,
  generator_version TEXT NOT NULL CHECK (length(generator_version) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  UNIQUE (content_date, track),
  UNIQUE (track, fingerprint),
  FOREIGN KEY (content_date) REFERENCES daily_content(content_date) ON DELETE RESTRICT,
  CHECK (source_url IS NULL OR source_url LIKE 'https://%')
) STRICT;

CREATE INDEX daily_topics_track_date_idx
  ON daily_topics (track, content_date DESC);

CREATE TABLE topic_practice_state (
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('academic', 'general')),
  topic_fingerprint TEXT NOT NULL CHECK (length(topic_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'review')),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, content_date, track),
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (content_date, track)
    REFERENCES daily_topics(content_date, track) ON DELETE CASCADE,
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR status <> 'completed'
  )
) STRICT;

CREATE TABLE topic_practice_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('academic', 'general')),
  action TEXT NOT NULL CHECK (action IN ('complete', 'review', 'reset')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key),
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (content_date, track)
    REFERENCES daily_topics(content_date, track) ON DELETE CASCADE
) STRICT;

CREATE INDEX topic_practice_events_profile_date_idx
  ON topic_practice_events (profile_id, content_date DESC, created_at DESC);

CREATE TABLE topic_feedback (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('academic', 'general')),
  category TEXT NOT NULL
    CHECK (category IN ('accuracy', 'sensitive', 'copyright', 'other')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key),
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (content_date, track)
    REFERENCES daily_topics(content_date, track) ON DELETE CASCADE
) STRICT;

CREATE INDEX topic_feedback_date_idx
  ON topic_feedback (content_date DESC, category);
