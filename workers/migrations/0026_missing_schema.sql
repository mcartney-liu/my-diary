-- 补三张代码里已引用但 migration 里漏建的表
-- 每张表用 IF NOT EXISTS 兜底，避免部分环境已手动建表导致重跑失败

-- ===== papers：手账本（App 端画纸生成的手账页） =====
CREATE TABLE IF NOT EXISTS papers (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  image_data   TEXT,
  thumbnail    TEXT,
  show_lines   INTEGER DEFAULT 1,
  is_public    INTEGER DEFAULT 0,
  author_name  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id);

-- ===== user_memory：小麦从对话里提取的用户画像/偏好/事实 =====
CREATE TABLE IF NOT EXISTS user_memory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,           -- profile/preference/fact/task/interest
  content      TEXT NOT NULL,
  confidence   REAL DEFAULT 0.7,
  status       TEXT DEFAULT 'active',   -- active / archived
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(user_id, content)
);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id, status);

-- ===== wiki_debug_log：Wiki 模块的运行时日志（dblog() 写入） =====
CREATE TABLE IF NOT EXISTS wiki_debug_log (
  id    TEXT PRIMARY KEY,
  ts    INTEGER NOT NULL,
  tag   TEXT NOT NULL,
  msg   TEXT,
  data  TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_debug_log_ts ON wiki_debug_log(ts DESC);
