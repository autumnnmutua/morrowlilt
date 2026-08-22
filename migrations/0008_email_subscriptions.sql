CREATE TABLE users (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  email_hash TEXT NOT NULL UNIQUE CHECK (length(email_hash) = 64),
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'
    CHECK (length(timezone) BETWEEN 3 AND 64),
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'verified', 'unsubscribed')),
  verification_token_hash TEXT
    CHECK (verification_token_hash IS NULL OR length(verification_token_hash) = 64),
  verification_expires_at TEXT,
  verified_at TEXT,
  unsubscribed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  CHECK (
    (email_status = 'pending' AND verification_token_hash IS NOT NULL AND verification_expires_at IS NOT NULL)
    OR email_status <> 'pending'
  )
) STRICT;

CREATE INDEX users_email_status_idx
  ON users (email_status, updated_at DESC);

CREATE TABLE email_subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('bind_requested', 'verified', 'test_sent', 'unsubscribed')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, idempotency_key)
) STRICT;

CREATE INDEX email_subscription_events_user_idx
  ON email_subscription_events (user_id, created_at DESC);

CREATE VIEW email_send_logs AS
SELECT
  deliveries.id AS id,
  deliveries.content_date AS date,
  deliveries.recipient_hash AS receiver,
  content.content_hash AS content_hash,
  deliveries.status AS send_status,
  deliveries.sent_at AS sent_at
FROM email_deliveries AS deliveries
JOIN daily_content AS content
  ON content.content_date = deliveries.content_date;
