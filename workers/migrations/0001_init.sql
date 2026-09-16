-- MyDiary D1 Schema
-- 3 张表：users（账号） + profiles（扩展信息） + diaries（日记数据）

-- 账号表：存 email + 密码哈希 + 基本信息
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,                    -- uuid
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                      -- pbkdf2 哈希
  nickname     TEXT DEFAULT '',
  avatar       TEXT DEFAULT '',
  created_at   INTEGER NOT NULL,                    -- unix timestamp
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 账号扩展信息（后续可以加更多字段）
CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio          TEXT DEFAULT '',
  theme        TEXT DEFAULT 'paper',                -- 主题
  default_mood TEXT DEFAULT 'calm',
  daily_goal   INTEGER DEFAULT 1,                   -- 每日目标篇数
  streak_start INTEGER,                             -- 连续写作开始日期
  streak_days  INTEGER DEFAULT 0,
  total_diaries INTEGER DEFAULT 0,
  total_words   INTEGER DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

-- 日记表：每篇日记一行，blocks 用 JSON 存储（D1 支持 JSON 函数）
CREATE TABLE IF NOT EXISTS diaries (
  id           TEXT PRIMARY KEY,                    -- uuid
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,                       -- YYYY-MM-DD
  template_id  TEXT DEFAULT 'diary',
  title        TEXT DEFAULT '',
  mood_id      TEXT DEFAULT 'calm',
  tags         TEXT DEFAULT '[]',                   -- JSON array
  weather      TEXT,                                -- { temp, condition, icon }
  blocks       TEXT DEFAULT '[]',                   -- JSON array of DiaryBlock
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(user_id, date)                             -- 每个用户每天一篇（可扩展为多篇）
);

CREATE INDEX IF NOT EXISTS idx_diaries_user_date ON diaries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_diaries_template  ON diaries(user_id, template_id);
