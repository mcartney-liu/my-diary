-- 用户自定义模板表
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  description TEXT DEFAULT '',
  blocks TEXT NOT NULL,              -- JSON: DiaryBlock[]（模板的初始 blocks）
  default_title TEXT DEFAULT '',
  default_tags TEXT DEFAULT '[]',    -- JSON: string[]
  wallpaper TEXT DEFAULT '',
  show_lines INTEGER DEFAULT 1,      -- 0 or 1
  default_mood_id TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
