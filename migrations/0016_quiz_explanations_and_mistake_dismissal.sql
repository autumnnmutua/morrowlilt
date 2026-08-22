ALTER TABLE quiz_session_questions
  ADD COLUMN answer_analysis_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(answer_analysis_json));

ALTER TABLE mistake_book
  ADD COLUMN dismissed_at TEXT;

CREATE INDEX mistake_book_visible_idx
  ON mistake_book (profile_id, dismissed_at, status, next_review_date);
