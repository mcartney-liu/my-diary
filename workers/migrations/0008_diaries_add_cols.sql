-- 给 diaries 表加 4 个之前只在 localStorage 存的字段
-- 目的: 跨设备同步软删、时间胶囊、壁纸等状态

ALTER TABLE diaries ADD COLUMN deleted_at INTEGER;
ALTER TABLE diaries ADD COLUMN capsule_unlock_at INTEGER;
ALTER TABLE diaries ADD COLUMN wallpaper TEXT;
ALTER TABLE diaries ADD COLUMN show_lines INTEGER DEFAULT 1;
