CREATE TABLE exam_dictionary_lists (
  slug TEXT PRIMARY KEY CHECK (slug GLOB '[a-z0-9-]*' AND length(slug) BETWEEN 2 AND 32),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  short_name TEXT NOT NULL CHECK (length(short_name) BETWEEN 2 AND 24),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 300),
  source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 120),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_license TEXT NOT NULL CHECK (length(source_license) BETWEEN 1 AND 80),
  entry_count INTEGER NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
  letter_counts_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(letter_counts_json) AND json_type(letter_counts_json) = 'object'),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 1 AND 100),
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX exam_dictionary_lists_sort_order_idx
  ON exam_dictionary_lists (sort_order);

CREATE TABLE exam_dictionary_entries (
  list_slug TEXT NOT NULL REFERENCES exam_dictionary_lists(slug) ON DELETE CASCADE,
  normalized_word TEXT NOT NULL
    CHECK (length(normalized_word) BETWEEN 1 AND 120 AND normalized_word = lower(normalized_word)),
  display_word TEXT NOT NULL CHECK (length(display_word) BETWEEN 1 AND 120),
  initial TEXT NOT NULL CHECK (initial GLOB '[A-Z]'),
  rank INTEGER NOT NULL CHECK (rank >= 1),
  PRIMARY KEY (list_slug, normalized_word)
) WITHOUT ROWID, STRICT;

CREATE INDEX exam_dictionary_entries_browse_idx
  ON exam_dictionary_entries (list_slug, initial, normalized_word);

CREATE TABLE dictionary_exam_lexemes (
  normalized_word TEXT PRIMARY KEY
    CHECK (length(normalized_word) BETWEEN 1 AND 120 AND normalized_word = lower(normalized_word)),
  display_word TEXT NOT NULL CHECK (length(display_word) BETWEEN 1 AND 120),
  phonetic TEXT,
  english_definition TEXT NOT NULL DEFAULT '',
  chinese_translation TEXT NOT NULL DEFAULT '',
  parts_of_speech TEXT NOT NULL DEFAULT '',
  exchange TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 120),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_license TEXT NOT NULL CHECK (length(source_license) BETWEEN 1 AND 80),
  updated_at TEXT NOT NULL
) WITHOUT ROWID, STRICT;

INSERT INTO exam_dictionary_lists (
  slug, name, short_name, description, source_name, source_url,
  source_license, sort_order, updated_at
) VALUES
  ('cet4', '大学英语四级备考词典', 'CET-4', '大学英语四级阅读、听力与写作常见词汇。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 1, CURRENT_TIMESTAMP),
  ('cet6', '大学英语六级备考词典', 'CET-6', '大学英语六级常见词汇，包含与四级重叠的基础词。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 2, CURRENT_TIMESTAMP),
  ('postgrad', '全国硕士研究生招生考试备考词典', '考研', '研究生入学英语考试常见词汇。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 3, CURRENT_TIMESTAMP),
  ('pets5', '全国英语等级考试五级备考词典', 'PETS-5', '面向 PETS-5 难度范围整理的英语备考词汇。', 'ECDICT and frequency selection', 'https://github.com/skywind3000/ECDICT', 'MIT', 4, CURRENT_TIMESTAMP),
  ('tem4', '英语专业四级备考词典', 'TEM-4', '英语专业四级常见基础与专业学习词汇。', 'ECDICT with Qwerty Learner headwords', 'https://github.com/RealKai42/qwerty-learner', 'MIT / GPL-3.0 source attribution', 5, CURRENT_TIMESTAMP),
  ('tem8', '英语专业八级备考词典', 'TEM-8', '英语专业八级常见进阶词汇。', 'ECDICT with Qwerty Learner headwords', 'https://github.com/RealKai42/qwerty-learner', 'MIT / GPL-3.0 source attribution', 6, CURRENT_TIMESTAMP),
  ('ielts', 'IELTS 备考词典', 'IELTS', '面向 IELTS 阅读、听力与写作场景的常见词汇。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 7, CURRENT_TIMESTAMP),
  ('toefl', 'TOEFL 备考词典', 'TOEFL', '面向 TOEFL 学术英语场景的常见词汇。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 8, CURRENT_TIMESTAMP),
  ('gre', 'GRE 备考词典', 'GRE', '面向 GRE 文字推理与学术阅读的进阶词汇。', 'ECDICT', 'https://github.com/skywind3000/ECDICT', 'MIT', 9, CURRENT_TIMESTAMP),
  ('sat', 'SAT 备考词典', 'SAT', '面向 SAT 阅读与语言部分的常见词汇。', 'ECDICT with Qwerty Learner headwords', 'https://github.com/RealKai42/qwerty-learner', 'MIT / GPL-3.0 source attribution', 10, CURRENT_TIMESTAMP),
  ('gmat', 'GMAT 备考词典', 'GMAT', '面向 GMAT 语言推理与商务学术语境的常见词汇。', 'ECDICT with Qwerty Learner headwords', 'https://github.com/RealKai42/qwerty-learner', 'MIT / GPL-3.0 source attribution', 11, CURRENT_TIMESTAMP),
  ('awl', 'Academic Word List 学术词典', 'AWL', '570 个高频学术词族的核心词，适用于跨学科学术阅读与写作。', 'Academic Word List', 'https://www.wgtn.ac.nz/lals/resources/academicwordlist', 'AWL attribution', 12, CURRENT_TIMESTAMP);

PRAGMA optimize;
