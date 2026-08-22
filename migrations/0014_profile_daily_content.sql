CREATE TABLE profile_daily_content (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL
    CHECK (
      content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', content_date) = content_date
    ),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 2),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  source TEXT NOT NULL CHECK (source IN ('online', 'cache', 'seed')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  attribution TEXT NOT NULL CHECK (length(attribution) BETWEEN 1 AND 500),
  generated_at TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('C1', 'C2')),
  theme TEXT NOT NULL CHECK (
    theme IN ('learning', 'campus', 'technology', 'environment', 'work', 'health', 'city', 'culture')
  ),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('original', 'ai_assisted', 'licensed')),
  source_url TEXT,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  generator_version TEXT NOT NULL CHECK (length(generator_version) BETWEEN 1 AND 80),
  immutable_created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, content_date),
  UNIQUE (profile_id, fingerprint),
  UNIQUE (content_date, fingerprint),
  UNIQUE (profile_id, content_date, id)
) STRICT;

CREATE INDEX profile_daily_content_range_idx
  ON profile_daily_content (profile_id, content_date ASC);

CREATE TABLE profile_daily_content_components (
  profile_id TEXT NOT NULL,
  component_hash TEXT NOT NULL CHECK (length(component_hash) = 64),
  component_type TEXT NOT NULL
    CHECK (component_type IN ('sentence', 'vocabulary', 'practical_expression')),
  normalized_value TEXT NOT NULL CHECK (length(normalized_value) BETWEEN 1 AND 500),
  content_date TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, component_hash),
  FOREIGN KEY (profile_id, content_date, content_id)
    REFERENCES profile_daily_content(profile_id, content_date, id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX profile_daily_components_date_idx
  ON profile_daily_content_components (profile_id, content_date DESC, component_type);

CREATE TABLE profile_daily_learning_packages (
  profile_id TEXT NOT NULL,
  content_date TEXT NOT NULL,
  content_id TEXT NOT NULL,
  package_json TEXT NOT NULL CHECK (json_valid(package_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, content_date),
  FOREIGN KEY (profile_id, content_date, content_id)
    REFERENCES profile_daily_content(profile_id, content_date, id)
    ON DELETE CASCADE,
  UNIQUE (profile_id, content_hash)
) STRICT;
