CREATE TABLE app_profile (
  id TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 3 AND 64),
  created_date TEXT NOT NULL
    CHECK (
      created_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', created_date) = created_date
      AND created_date > '0001-01-01'
    ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE learning_progress (
  profile_id TEXT PRIMARY KEY,
  settled_through_date TEXT NOT NULL
    CHECK (
      settled_through_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', settled_through_date) = settled_through_date
    ),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE checkin_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  business_date TEXT NOT NULL
    CHECK (
      business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', business_date) = business_date
    ),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('learned', 'not_learned', 'undo')),
  previous_settled_date TEXT NOT NULL
    CHECK (
      previous_settled_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', previous_settled_date) = previous_settled_date
    ),
  resulting_settled_date TEXT NOT NULL
    CHECK (
      resulting_settled_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', resulting_settled_date) = resulting_settled_date
    ),
  reverses_event_id TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (reverses_event_id) REFERENCES checkin_events(id),
  UNIQUE (profile_id, idempotency_key),
  CHECK (
    (event_type = 'undo' AND reverses_event_id IS NOT NULL)
    OR (event_type <> 'undo' AND reverses_event_id IS NULL)
  )
) STRICT;

CREATE INDEX checkin_events_profile_date_idx
  ON checkin_events (profile_id, business_date DESC, created_at DESC);

CREATE UNIQUE INDEX checkin_events_one_undo_idx
  ON checkin_events (reverses_event_id)
  WHERE reverses_event_id IS NOT NULL;

CREATE TRIGGER app_profile_initialize_progress
AFTER INSERT ON app_profile
BEGIN
  INSERT INTO learning_progress (
    profile_id, settled_through_date, version, updated_at
  ) VALUES (
    NEW.id, date(NEW.created_date, '-1 day'), 0, NEW.created_at
  );
END;

CREATE TRIGGER daily_content_iso_date_insert
BEFORE INSERT ON daily_content
WHEN NOT (
  NEW.content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND strftime('%Y-%m-%d', NEW.content_date) = NEW.content_date
  AND (
    NEW.source_date IS NULL
    OR (
      NEW.source_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', NEW.source_date) = NEW.source_date
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'daily_content dates must be ISO local dates');
END;
