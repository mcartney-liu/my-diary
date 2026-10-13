-- wiki_sources 加 source 字段：标记资料来源，方便溯源
-- 值：paste（资料库粘贴）/ kb_entry（知识库录入按钮）/ qa（小麦问答 import_mode 生成）
ALTER TABLE wiki_sources ADD COLUMN source TEXT DEFAULT 'paste';
UPDATE wiki_sources SET source = 'paste' WHERE source IS NULL;
