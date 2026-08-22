CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  login_email_hash TEXT NOT NULL UNIQUE CHECK (length(login_email_hash) = 64),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  issuer TEXT NOT NULL CHECK (length(issuer) BETWEEN 8 AND 512),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 512),
  email_hash TEXT NOT NULL CHECK (length(email_hash) = 64),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (issuer, subject),
  UNIQUE (issuer, email_hash)
) STRICT;

CREATE INDEX auth_identities_account_idx
  ON auth_identities (account_id, status, last_seen_at DESC);

CREATE TABLE account_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'identity_reauthorized', 'identity_revoked', 'disabled', 'enabled')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX account_events_account_idx
  ON account_events (account_id, created_at DESC);

CREATE TABLE email_provider_credentials (
  profile_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  encrypted_api_key TEXT NOT NULL CHECK (length(encrypted_api_key) BETWEEN 16 AND 4096),
  encryption_iv TEXT NOT NULL CHECK (length(encryption_iv) BETWEEN 16 AND 64),
  mail_from TEXT NOT NULL CHECK (length(mail_from) BETWEEN 3 AND 320),
  send_hour_local INTEGER NOT NULL DEFAULT 23 CHECK (send_hour_local BETWEEN 0 AND 23),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE
) STRICT;

ALTER TABLE email_deliveries ADD COLUMN profile_id TEXT
  REFERENCES app_profile(id) ON DELETE CASCADE;

CREATE INDEX email_deliveries_profile_date_idx
  ON email_deliveries (profile_id, content_date DESC, delivery_type);
