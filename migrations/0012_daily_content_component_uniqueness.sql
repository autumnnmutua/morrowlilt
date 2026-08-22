CREATE TABLE daily_content_components (
  component_hash TEXT PRIMARY KEY CHECK (length(component_hash) = 64),
  component_type TEXT NOT NULL
    CHECK (component_type IN ('sentence', 'vocabulary', 'practical_expression')),
  normalized_value TEXT NOT NULL CHECK (length(normalized_value) BETWEEN 1 AND 500),
  content_date TEXT NOT NULL
    CHECK (
      content_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND strftime('%Y-%m-%d', content_date) = content_date
    ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (content_date) REFERENCES daily_content(content_date) ON DELETE RESTRICT
) STRICT;

CREATE INDEX daily_content_components_date_idx
  ON daily_content_components (content_date DESC, component_type);
