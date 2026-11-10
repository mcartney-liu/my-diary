-- 补三张代码里已引用但 migration 里漏建的表
-- 每张表用 IF NOT EXISTS 兜底，避免部分环境已手动建表导致重跑失败
-- 末尾补 11 条 ALTER TABLE，解决 users / wiki_knowledge_bases / templates / wiki_links 缺列问题

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
-- 注意：created_at / updated_at 用 TEXT + DEFAULT CURRENT_TIMESTAMP
--       因为 Worker 代码 INSERT 只写 5 列（user_id, type, content, confidence, status），
--       不写时间列；INTEGER NOT NULL 无默认值会导致 NOT NULL constraint failed
CREATE TABLE IF NOT EXISTS user_memory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,           -- profile/preference/fact/task/interest
  content      TEXT NOT NULL,
  confidence   REAL DEFAULT 0.7,
  status       TEXT DEFAULT 'active',   -- active / archived
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content)
);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id, status);

-- ===== wiki_debug_log：Wiki 模块的运行时日志（dblog() 写入） =====
-- 注意：tag 加 DEFAULT ''，因为 dblog() 存在不带 tag 的调用
CREATE TABLE IF NOT EXISTS wiki_debug_log (
  id    TEXT PRIMARY KEY,
  ts    INTEGER NOT NULL,
  tag   TEXT DEFAULT '',
  msg   TEXT,
  data  TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_debug_log_ts ON wiki_debug_log(ts DESC);

-- ===== R1：补 11 条 ALTER TABLE =====
-- 代码实际读的列在历史 migration 里漏掉了，导致 GET /api/profile /api/wiki/kbs /api/memory 等 500
-- 生产环境可能已通过代码运行时 ALTER TABLE / PRAGMA 手工补过，所以每条都用先查再加的方式（见部署脚本）

ALTER TABLE users ADD COLUMN identity TEXT;
ALTER TABLE users ADD COLUMN interests TEXT;
ALTER TABLE users ADD COLUMN onboarding_done INTEGER DEFAULT 0;

ALTER TABLE wiki_knowledge_bases ADD COLUMN slug TEXT;
ALTER TABLE wiki_knowledge_bases ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE wiki_knowledge_bases ADD COLUMN is_official INTEGER DEFAULT 0;

ALTER TABLE templates ADD COLUMN keywords TEXT;
ALTER TABLE templates ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE templates ADD COLUMN author_name TEXT;

ALTER TABLE wiki_links ADD COLUMN from_page_id TEXT;
ALTER TABLE wiki_links ADD COLUMN to_page_id TEXT;
