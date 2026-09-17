-- 每日 AI 总结表
-- 用途: 首页 StreakBadge 显示"昨天/今天"的 AI 总结，
--       用户点「📖 查看历史」可回溯过去所有自动生成的每日总结
-- 特点: 每个用户每天一条，AI 生成后存库，跨设备可见

CREATE TABLE IF NOT EXISTS daily_summaries (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,              -- YYYY-MM-DD
  summary      TEXT NOT NULL,              -- AI 生成的一句话总结
  diary_count  INTEGER DEFAULT 0,          -- 当天有几篇日记（生成时计数）
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ds_user ON daily_summaries(user_id);
