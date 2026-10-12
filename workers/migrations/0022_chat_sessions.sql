-- AI 聊天会话云端持久化
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT '新对话',
  source_type TEXT NOT NULL DEFAULT 'diary',  -- 'diary' | 'wiki'
  kb_id TEXT,                                  -- wiki 会话绑定的 KB
  msgs TEXT NOT NULL DEFAULT '[]',             -- JSON 数组
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_kb ON chat_sessions(kb_id);
