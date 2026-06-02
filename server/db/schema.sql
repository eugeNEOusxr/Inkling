-- Inkling account & notification schema (reference for SQLite/Postgres migration)
-- Current dev server uses JSON files under data/users/ with equivalent fields.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  notifications_json TEXT NOT NULL DEFAULT '{}',
  theme_json TEXT NOT NULL DEFAULT '{}',
  ai_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE notification_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT,
  message TEXT,
  trigger_at INTEGER,
  recurrence TEXT,
  interval_minutes INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notification_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  schedule_id TEXT,
  fired_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT
);

CREATE TABLE ai_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  conversation_id TEXT,
  message_id TEXT,
  rating TEXT NOT NULL,
  category TEXT,
  comment TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_schedules_user ON notification_schedules(user_id);
CREATE INDEX idx_feedback_user ON ai_feedback(user_id);
