-- v4: 多知识库架构
-- 删掉 v3 的表（dev 只有测试数据）
DROP TABLE IF EXISTS wiki_rules;
DROP TABLE IF EXISTS wiki_categories;
DROP TABLE IF EXISTS wiki_templates;
DROP TABLE IF EXISTS wiki_sources;
DROP TABLE IF EXISTS wiki_pages;
DROP TABLE IF EXISTS wiki_links;

-- ====== 多知识库 ======
CREATE TABLE wiki_knowledge_bases (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_wiki_kb_user ON wiki_knowledge_bases(user_id);

-- ====== 分类（含模板，1:1 绑定）======
CREATE TABLE wiki_categories (
  id            TEXT PRIMARY KEY,
  kb_id         TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  extract_hints TEXT NOT NULL DEFAULT '',
  page_format   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(kb_id, slug)
);
CREATE INDEX idx_wiki_cat_kb ON wiki_categories(kb_id);

-- ====== 资料 ======
CREATE TABLE wiki_sources (
  id          TEXT PRIMARY KEY,
  kb_id       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  ref_id      TEXT,
  title       TEXT,
  raw_text    TEXT NOT NULL,
  ingested    INTEGER NOT NULL DEFAULT 0,
  ingested_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_wiki_src_kb ON wiki_sources(kb_id, ingested);

-- ====== Wiki 页面 ======
CREATE TABLE wiki_pages (
  id          TEXT PRIMARY KEY,
  kb_id       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  category_id TEXT,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  vector      TEXT,
  source_ids  TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(kb_id, title)
);
CREATE INDEX idx_wiki_pages_kb ON wiki_pages(kb_id);

-- ====== 双向链接 ======
CREATE TABLE wiki_links (
  id          TEXT PRIMARY KEY,
  kb_id       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  from_title  TEXT NOT NULL,
  to_title    TEXT NOT NULL,
  relation    TEXT DEFAULT 'related',
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_wiki_links_kb ON wiki_links(kb_id, from_title);
