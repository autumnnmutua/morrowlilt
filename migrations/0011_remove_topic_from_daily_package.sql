CREATE TABLE daily_learning_packages_next (
  content_date TEXT PRIMARY KEY
    CHECK (
      content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', content_date) = content_date
    ),
  content_id TEXT NOT NULL,
  package_json TEXT NOT NULL CHECK (json_valid(package_json)),
  content_hash TEXT NOT NULL UNIQUE CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (content_id) REFERENCES daily_content(id)
) STRICT;

-- Packages are derived from immutable daily_content and can be regenerated.
-- Dropping legacy package rows removes obsolete oral/writing task fields without
-- changing learning progress, content history, quiz history, or email delivery logs.
DROP TABLE daily_learning_packages;
ALTER TABLE daily_learning_packages_next RENAME TO daily_learning_packages;

CREATE INDEX daily_learning_packages_created_idx
  ON daily_learning_packages (created_at DESC);
