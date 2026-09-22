-- 0017: profiles 表加 font 字段（字体设置同步后端，避免换设备丢失）
-- 字体可选值：hand（全手写，默认）/ pen（钢笔中文）/ sans（系统默认）
ALTER TABLE profiles ADD COLUMN font TEXT DEFAULT 'hand';
