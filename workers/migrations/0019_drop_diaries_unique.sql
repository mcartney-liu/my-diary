-- 去掉 prod D1 diaries 表残留的 UNIQUE(user_id, date) 约束
-- dev D1 已经跑过这个了，prod 还卡着
-- 新表结构 = 当前 diaries 表结构，只是去掉 UNIQUE

CREATE TABLE diaries_new (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date               TEXT NOT NULL,
  template_id        TEXT DEFAULT 'diary',
  title              TEXT DEFAULT '',
  mood_id            TEXT DEFAULT 'calm',
  tags               TEXT DEFAULT '[]',
  weather            TEXT,
  blocks             TEXT DEFAULT '[]',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER,
  capsule_unlock_at  INTEGER,
  wallpaper          TEXT,
  show_lines         INTEGER DEFAULT 1
);

INSERT INTO diaries_new SELECT * FROM diaries;

DROP TABLE diaries;

ALTER TABLE diaries_new RENAME TO diaries;
