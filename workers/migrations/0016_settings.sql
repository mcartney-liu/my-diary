-- v0.5.1 设置功能：登录追踪 + 每日提醒
-- users.last_login_at: 毫秒级时间戳，登录时更新，用于统计 DAU
ALTER TABLE users ADD COLUMN last_login_at INTEGER DEFAULT 0;

-- profiles: 每日提醒（前端用 Notification API 推送，后端只存偏好）
-- remind_enabled: 0 关 / 1 开
-- remind_time: "HH:mm" 格式，比如 "21:00"
ALTER TABLE profiles ADD COLUMN remind_enabled INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN remind_time TEXT DEFAULT '21:00';
