CREATE TABLE dictionary_translation_cache (
  source_hash TEXT PRIMARY KEY CHECK (length(source_hash) = 64),
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 4000),
  translated_text TEXT NOT NULL CHECK (length(translated_text) BETWEEN 1 AND 4000),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  attribution TEXT NOT NULL CHECK (length(attribution) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE dictionary_suggestion_cache (
  normalized_query TEXT PRIMARY KEY CHECK (length(normalized_query) BETWEEN 1 AND 32),
  suggestions_json TEXT NOT NULL CHECK (json_valid(suggestions_json)),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (expires_at > fetched_at)
) STRICT;

CREATE INDEX dictionary_suggestion_cache_expiry_idx
  ON dictionary_suggestion_cache (expires_at);

CREATE TABLE dictionary_lexicon_senses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_lemma TEXT NOT NULL CHECK (length(normalized_lemma) BETWEEN 1 AND 120),
  lemma TEXT NOT NULL CHECK (length(lemma) BETWEEN 1 AND 120),
  part_of_speech TEXT NOT NULL CHECK (part_of_speech IN ('noun', 'verb', 'adjective', 'adverb')),
  definition TEXT NOT NULL CHECK (length(definition) BETWEEN 1 AND 4000),
  examples_json TEXT NOT NULL CHECK (json_valid(examples_json)),
  synonyms_json TEXT NOT NULL CHECK (json_valid(synonyms_json)),
  source_synset_id TEXT NOT NULL CHECK (length(source_synset_id) BETWEEN 1 AND 40),
  UNIQUE (normalized_lemma, part_of_speech, source_synset_id)
) STRICT;

CREATE INDEX dictionary_lexicon_lemma_idx
  ON dictionary_lexicon_senses (normalized_lemma, part_of_speech, id);

CREATE TABLE dictionary_lexicon_forms (
  normalized_form TEXT NOT NULL CHECK (length(normalized_form) BETWEEN 1 AND 120),
  form TEXT NOT NULL CHECK (length(form) BETWEEN 1 AND 120),
  normalized_lemma TEXT NOT NULL CHECK (length(normalized_lemma) BETWEEN 1 AND 120),
  lemma TEXT NOT NULL CHECK (length(lemma) BETWEEN 1 AND 120),
  part_of_speech TEXT NOT NULL CHECK (part_of_speech IN ('noun', 'verb', 'adjective', 'adverb')),
  form_label TEXT NOT NULL CHECK (length(form_label) BETWEEN 1 AND 80),
  PRIMARY KEY (normalized_form, normalized_lemma, part_of_speech)
) WITHOUT ROWID, STRICT;

CREATE INDEX dictionary_lexicon_forms_lemma_idx
  ON dictionary_lexicon_forms (normalized_lemma, part_of_speech);

CREATE TABLE dictionary_lexicon_metadata (
  resource_name TEXT PRIMARY KEY,
  resource_version TEXT NOT NULL,
  license_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  sense_count INTEGER NOT NULL CHECK (sense_count >= 0),
  lemma_count INTEGER NOT NULL CHECK (lemma_count >= 0)
) STRICT;
