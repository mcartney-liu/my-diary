-- 补 user_memory 表：小麦从对话里提取的用户画像/偏好/事实
-- 上一轮整改 0026 里包含这段，但当时 d1_migrations 被标记为已应用，
-- 生产上手工建的表没进迁移记录。本次用新编号 0027 正式纳入迁移链。
-- 已有表用 IF NOT EXISTS 跳过；空库首次跑则正常建表。

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
