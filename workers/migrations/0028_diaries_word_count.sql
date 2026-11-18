-- 0028_diaries_word_count.sql
-- 给 diaries 表加 word_count 列 + 索引，消除 handleGetProfile 里的扫全库 JSON.parse 循环
-- 写路径 handleSaveDiary (UPDATE + INSERT) 会维护此列
-- 已有数据的回填由 workers/scripts/backfill-word-count.js 完成（SQL 里没法可靠解析 JSON）

ALTER TABLE diaries ADD COLUMN word_count INTEGER DEFAULT 0;

-- profile 接口 L777 WHERE user_id=? AND (deleted_at IS NULL OR deleted_at='') 的专用索引
-- 现有 idx_diaries_user_date / idx_diaries_template 都不含 deleted_at
CREATE INDEX IF NOT EXISTS idx_diaries_user_deleted ON diaries(user_id, deleted_at);
