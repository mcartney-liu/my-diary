-- v4.3: wiki_pages 加 summary 字段（目录.md 需要一句话说明）
ALTER TABLE wiki_pages ADD COLUMN summary TEXT;
