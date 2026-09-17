-- 计划表
-- 用途: 让用户一眼看到"未来有哪些计划"，类似 Milestones 让用户看到"有哪些纪念日"
-- 和 milestones 不同: plans 不按年重复，就是一个目标日期 + 状态

CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 目标日期（YYYY-MM-DD）— 可空（如果计划还没定日期）
  target_date  TEXT,

  -- 状态: pending(待办) | completed(已完成) | overdue(已过期)
  status       TEXT NOT NULL DEFAULT 'pending',

  -- 显示
  icon         TEXT DEFAULT '🎯',
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  diary_id     TEXT,
  auto_created INTEGER DEFAULT 0,

  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id);
