CREATE TABLE daily_content (
  id TEXT PRIMARY KEY,
  content_date TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('online', 'cache', 'seed')),
  source_date TEXT,
  provider TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  attribution TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX daily_content_date_idx
  ON daily_content (content_date DESC);

CREATE TABLE email_delivery (
  id TEXT PRIMARY KEY,
  content_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  attempted_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (content_date, provider),
  FOREIGN KEY (content_date) REFERENCES daily_content(content_date)
) STRICT;

CREATE INDEX email_delivery_date_idx
  ON email_delivery (content_date DESC);
