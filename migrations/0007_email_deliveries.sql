CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY,
  content_date TEXT NOT NULL,
  recipient_hash TEXT NOT NULL CHECK (length(recipient_hash) = 64),
  delivery_key TEXT NOT NULL UNIQUE CHECK (length(delivery_key) BETWEEN 20 AND 160),
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
  CHECK (
    (status = 'sending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'sending'
  ),
  CHECK (
    (status = 'sent' AND provider_message_id IS NOT NULL AND sent_at IS NOT NULL)
    OR status <> 'sent'
  ),
  FOREIGN KEY (content_date) REFERENCES daily_content(content_date)
) STRICT;

CREATE UNIQUE INDEX email_deliveries_date_recipient_type_idx
  ON email_deliveries (content_date, recipient_hash, delivery_type);

CREATE INDEX email_deliveries_retry_idx
  ON email_deliveries (status, next_retry_at, lease_expires_at);

CREATE INDEX email_deliveries_date_idx
  ON email_deliveries (content_date DESC);
