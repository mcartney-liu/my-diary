-- 反馈与建议
CREATE TABLE IF NOT EXISTS feedbacks (
  id          TEXT PRIMARY KEY,                     -- uuid
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT DEFAULT 'suggestion',           -- suggestion / bug / other
  title       TEXT DEFAULT '',
  content     TEXT NOT NULL,
  app_version TEXT DEFAULT '0.1.0',
  device      TEXT DEFAULT '',                      -- iPhone / Windows Chrome 等
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(created_at);
