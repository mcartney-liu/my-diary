-- 纪念日倒计时表
-- 三种类型：
--   fixed     = 每年固定月日重复（生日、纪念日）→ target_mm + target_dd
--   start     = 从某天开始算"第 N 天"（认识 X 天、养猫 X 天）→ start_date
--   countdown = 距离某天还有 N 天（考试、放假）→ target_date

CREATE TABLE IF NOT EXISTS milestones (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 类型: fixed | start | countdown
  type         TEXT NOT NULL,

  -- fixed 用这俩（存月日）
  target_mm    INTEGER,
  target_dd    INTEGER,

  -- start 用这个（起始日期 YYYY-MM-DD）
  start_date   TEXT,

  -- countdown 用这个（目标日期 YYYY-MM-DD）
  target_date  TEXT,

  -- 显示
  icon         TEXT DEFAULT '🎯',
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  diary_id     TEXT,                           -- 关联的日记 ID（可选）
  auto_created INTEGER DEFAULT 0,              -- 1 = AI 自动识别创建

  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_milestones_user ON milestones(user_id);
