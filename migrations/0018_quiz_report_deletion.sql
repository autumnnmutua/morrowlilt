ALTER TABLE quiz_sessions
  ADD COLUMN report_deleted_at TEXT;

CREATE INDEX quiz_sessions_visible_report_idx
  ON quiz_sessions (
    profile_id,
    status,
    report_deleted_at,
    completed_at DESC
  );
