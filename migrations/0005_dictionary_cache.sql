CREATE TABLE dictionary_cache (
  normalized_term TEXT PRIMARY KEY
    CHECK (length(normalized_term) BETWEEN 1 AND 64),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 8 AND 1000),
  license_json TEXT NOT NULL CHECK (json_valid(license_json)),
  attribution TEXT NOT NULL CHECK (length(attribution) BETWEEN 1 AND 1000),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (expires_at > fetched_at)
) STRICT;

CREATE INDEX dictionary_cache_expiry_idx
  ON dictionary_cache (expires_at);

CREATE TABLE dictionary_search_history (
  profile_id TEXT NOT NULL,
  normalized_term TEXT NOT NULL
    CHECK (length(normalized_term) BETWEEN 1 AND 64),
  search_count INTEGER NOT NULL DEFAULT 1 CHECK (search_count >= 1),
  last_searched_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, normalized_term),
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX dictionary_search_history_recent_idx
  ON dictionary_search_history (profile_id, last_searched_at DESC);

CREATE TABLE dictionary_favorites (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  normalized_term TEXT NOT NULL
    CHECK (length(normalized_term) BETWEEN 1 AND 64),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, normalized_term)
) STRICT;

CREATE INDEX dictionary_favorites_profile_idx
  ON dictionary_favorites (profile_id, created_at DESC);

CREATE TABLE vocabulary_review_queue (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  normalized_term TEXT NOT NULL
    CHECK (length(normalized_term) BETWEEN 1 AND 64),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'mastered', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, normalized_term)
) STRICT;

CREATE INDEX vocabulary_review_queue_profile_idx
  ON vocabulary_review_queue (profile_id, status, updated_at DESC);
