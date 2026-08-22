CREATE TABLE daily_learning_packages (
  content_date TEXT PRIMARY KEY
    CHECK (
      content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', content_date) = content_date
    ),
  content_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('academic', 'general')),
  package_json TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (content_id) REFERENCES daily_content(id),
  FOREIGN KEY (topic_id) REFERENCES daily_topics(id)
) STRICT;

CREATE INDEX daily_learning_packages_created_idx
  ON daily_learning_packages (created_at DESC);
