DROP VIEW email_send_logs;

CREATE TABLE email_deliveries_v2 (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL,
  recipient_hash TEXT NOT NULL CHECK (length(recipient_hash) = 64),
  delivery_key TEXT NOT NULL UNIQUE CHECK (length(delivery_key) BETWEEN 20 AND 200),
  delivery_type TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (delivery_type IN ('scheduled', 'test')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  error_retryable INTEGER NOT NULL DEFAULT 0 CHECK (error_retryable IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  lease_token TEXT,
  lease_expires_at TEXT,
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  idempotency_expires_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, content_date, recipient_hash, delivery_type),
  CHECK (
    (status = 'sending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'sending'
  ),
  CHECK (
    (status = 'sent' AND provider_message_id IS NOT NULL AND sent_at IS NOT NULL)
    OR status <> 'sent'
  )
) STRICT;

INSERT INTO email_deliveries_v2 (
  id, profile_id, content_date, recipient_hash, delivery_key, delivery_type,
  status, provider, provider_message_id, error_code, error_retryable,
  attempt_count, lease_token, lease_expires_at, first_attempt_at,
  last_attempt_at, next_retry_at, idempotency_expires_at, sent_at,
  created_at, updated_at
)
SELECT id, COALESCE(profile_id, 'default'), content_date, recipient_hash,
       delivery_key, delivery_type, status, provider, provider_message_id,
       error_code, error_retryable, attempt_count, lease_token,
       lease_expires_at, first_attempt_at, last_attempt_at, next_retry_at,
       idempotency_expires_at, sent_at, created_at, updated_at
FROM email_deliveries;

DROP TABLE email_deliveries;
ALTER TABLE email_deliveries_v2 RENAME TO email_deliveries;

CREATE INDEX email_deliveries_retry_idx
  ON email_deliveries (status, next_retry_at, lease_expires_at);
CREATE INDEX email_deliveries_date_idx
  ON email_deliveries (content_date DESC);
CREATE INDEX email_deliveries_profile_date_idx
  ON email_deliveries (profile_id, content_date DESC, delivery_type);

CREATE VIEW email_send_logs AS
SELECT
  delivery.id AS id,
  delivery.profile_id AS profile_id,
  delivery.content_date AS date,
  delivery.recipient_hash AS receiver,
  content.content_hash AS content_hash,
  delivery.status AS send_status,
  delivery.sent_at AS sent_at
FROM email_deliveries AS delivery
LEFT JOIN profile_daily_content AS content
  ON content.profile_id = delivery.profile_id
 AND content.content_date = delivery.content_date;
