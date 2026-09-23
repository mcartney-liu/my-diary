-- v0.5.2 活动日志表：记录用户关键行为，用于运营统计
-- action 类型：register, login, save_diary, delete_diary, wiki_ingest, wiki_ask, ask, save_template, delete_template, share_template, change_password
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

-- 索引：按用户查行为、按时间查活跃
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(created_at);
