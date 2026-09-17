-- 去掉 diaries 表的 UNIQUE(user_id, date) 约束
-- Cloudflare D1 不支持 BEGIN TRANSACTION，直接执行

CREATE TABLE diaries_new (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  template_id  TEXT DEFAULT 'diary',
  title        TEXT DEFAULT '',
  mood_id      TEXT DEFAULT 'calm',
  tags         TEXT DEFAULT '[]',
  weather      TEXT,
  blocks       TEXT DEFAULT '[]',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

INSERT INTO diaries_new SELECT * FROM diaries;

DROP TABLE diaries;

ALTER TABLE diaries_new RENAME TO diaries;
