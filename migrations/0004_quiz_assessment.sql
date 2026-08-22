CREATE TABLE quiz_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('mixed', 'mistake_retest')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  seed_hex TEXT NOT NULL CHECK (length(seed_hex) = 64),
  question_fingerprint TEXT NOT NULL CHECK (length(question_fingerprint) = 64),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 30),
  settings_json TEXT NOT NULL CHECK (json_valid(settings_json)),
  degraded_reason TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  completed_at TEXT,
  total_score REAL,
  correct_count INTEGER,
  total_duration_ms INTEGER,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, idempotency_key),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
) STRICT;

CREATE INDEX quiz_sessions_recent_fingerprint_idx
  ON quiz_sessions (profile_id, started_at DESC, question_fingerprint);
CREATE INDEX quiz_sessions_resume_idx
  ON quiz_sessions (profile_id, status, last_activity_at DESC);

CREATE TABLE quiz_session_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  bank_question_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  question_type TEXT NOT NULL CHECK (
    question_type IN (
      'context_translation', 'spelling', 'cloze',
      'collocation_choice', 'phrase_meaning', 'mistake_retest'
    )
  ),
  public_json TEXT NOT NULL CHECK (json_valid(public_json)),
  standard_answer_json TEXT NOT NULL CHECK (json_valid(standard_answer_json)),
  acceptable_answers_json TEXT NOT NULL CHECK (json_valid(acceptable_answers_json)),
  explanation TEXT NOT NULL,
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('C1', 'C2')),
  theme TEXT NOT NULL,
  source TEXT NOT NULL,
  max_score REAL NOT NULL DEFAULT 1 CHECK (max_score > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, ordinal)
) STRICT;

CREATE INDEX quiz_session_questions_session_idx
  ON quiz_session_questions (session_id, ordinal);

CREATE TABLE quiz_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_question_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  normalized_response TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  score REAL NOT NULL CHECK (score >= 0),
  error_reason TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 3600000),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  answered_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_question_id) REFERENCES quiz_session_questions(id) ON DELETE CASCADE,
  UNIQUE (session_question_id),
  UNIQUE (session_id, idempotency_key)
) STRICT;

CREATE INDEX quiz_answers_session_idx ON quiz_answers (session_id, answered_at);

CREATE TABLE mistake_book (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  bank_question_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'mastered')),
  error_count INTEGER NOT NULL DEFAULT 1 CHECK (error_count >= 1),
  correct_streak INTEGER NOT NULL DEFAULT 0 CHECK (correct_streak >= 0),
  mastery INTEGER NOT NULL DEFAULT 20 CHECK (mastery BETWEEN 0 AND 100),
  first_wrong_at TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL,
  next_review_date TEXT NOT NULL CHECK (
    next_review_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND strftime('%Y-%m-%d', next_review_date) = next_review_date
  ),
  mastered_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES app_profile(id) ON DELETE CASCADE,
  UNIQUE (profile_id, bank_question_id),
  CHECK (
    (status = 'mastered' AND mastered_at IS NOT NULL)
    OR (status = 'active' AND mastered_at IS NULL)
  )
) STRICT;

CREATE INDEX mistake_book_due_idx
  ON mistake_book (profile_id, status, next_review_date, last_reviewed_at);

CREATE TABLE mistake_book_events (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('incorrect', 'correct')),
  mastery_before INTEGER NOT NULL CHECK (mastery_before BETWEEN 0 AND 100),
  mastery_after INTEGER NOT NULL CHECK (mastery_after BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  FOREIGN KEY (mistake_id) REFERENCES mistake_book(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX mistake_book_events_history_idx
  ON mistake_book_events (mistake_id, created_at DESC);
