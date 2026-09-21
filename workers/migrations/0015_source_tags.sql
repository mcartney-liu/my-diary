-- 资料全局化：wiki_sources 加 tags 字段（JSON 数组，存 KB id 标签）
-- 原来的 kb_id 保留但变成可选（ingest 时用传入的 kb_id 而非 source.kb_id）
ALTER TABLE wiki_sources ADD COLUMN tags TEXT;
UPDATE wiki_sources SET tags = '[]' WHERE tags IS NULL;
