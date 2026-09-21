-- ============================================================
-- Layer 3: Schema（用户自定义规则）
-- ============================================================

-- 用户的全局知识库规则
CREATE TABLE IF NOT EXISTS wiki_rules (
  user_id     TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '我的知识库',
  description TEXT,
  ingest_hint TEXT NOT NULL DEFAULT '请将新资料汇入知识库',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 用户定义的分类（资料夹）
CREATE TABLE IF NOT EXISTS wiki_categories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_wiki_cat_user ON wiki_categories(user_id);

-- 每个分类的页面模板
CREATE TABLE IF NOT EXISTS wiki_templates (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  extract_hints TEXT NOT NULL,
  page_format   TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_tpl_user ON wiki_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_wiki_tpl_cat  ON wiki_templates(category_id);

-- ============================================================
-- Layer 1: 原始资料（史料）
-- ============================================================

CREATE TABLE IF NOT EXISTS wiki_sources (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- text | diary
  ref_id      TEXT,                      -- diary_id when kind='diary'
  title       TEXT,
  raw_text    TEXT NOT NULL,
  ingested    INTEGER NOT NULL DEFAULT 0, -- 0=待汇入, 1=已汇入
  ingested_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_src_user    ON wiki_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_wiki_src_pending ON wiki_sources(user_id, ingested);

-- ============================================================
-- Layer 2: Wiki 页面
-- ============================================================

CREATE TABLE IF NOT EXISTS wiki_pages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  category_id TEXT,                      -- NULL=系统页面
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  vector      TEXT,                      -- bge-m3 embedding JSON
  source_ids  TEXT,                      -- JSON array
  template_id TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(user_id, title)
);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_user ON wiki_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_cat  ON wiki_pages(user_id, category_id);

-- 双向链接
CREATE TABLE IF NOT EXISTS wiki_links (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  from_title  TEXT NOT NULL,
  to_title    TEXT NOT NULL,
  relation    TEXT DEFAULT 'related',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_links_from ON wiki_links(from_title);
CREATE INDEX IF NOT EXISTS idx_wiki_links_to   ON wiki_links(to_title);
