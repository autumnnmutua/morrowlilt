ALTER TABLE daily_content ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'C1'
  CHECK (difficulty IN ('C1', 'C2'));
ALTER TABLE daily_content ADD COLUMN theme TEXT NOT NULL DEFAULT 'learning'
  CHECK (theme IN (
    'learning', 'campus', 'technology', 'environment',
    'work', 'health', 'city', 'culture'
  ));
ALTER TABLE daily_content ADD COLUMN origin_type TEXT NOT NULL DEFAULT 'original'
  CHECK (origin_type IN ('original', 'ai_assisted', 'licensed'));
ALTER TABLE daily_content ADD COLUMN source_url TEXT;
ALTER TABLE daily_content ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE daily_content ADD COLUMN generator_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE daily_content ADD COLUMN immutable_created_at TEXT NOT NULL DEFAULT '';

UPDATE daily_content
SET fingerprint = content_hash,
    generator_version = provider_version,
    immutable_created_at = generated_at
WHERE fingerprint = '' OR immutable_created_at = '';

CREATE INDEX daily_content_fingerprint_idx
  ON daily_content (fingerprint, content_date DESC);

CREATE TABLE daily_content_revision_audit (
  id TEXT PRIMARY KEY,
  content_date TEXT NOT NULL,
  previous_content_json TEXT NOT NULL,
  previous_content_hash TEXT NOT NULL,
  previous_fingerprint TEXT NOT NULL,
  previous_provider TEXT NOT NULL,
  replacement_content_json TEXT NOT NULL,
  replacement_content_hash TEXT NOT NULL,
  replacement_fingerprint TEXT NOT NULL,
  replacement_provider TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 8 AND 500),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  regenerated_at TEXT NOT NULL,
  FOREIGN KEY (content_date) REFERENCES daily_content(content_date),
  UNIQUE (content_date, idempotency_key)
) STRICT;

CREATE INDEX daily_content_revision_date_idx
  ON daily_content_revision_audit (content_date DESC, regenerated_at DESC);
