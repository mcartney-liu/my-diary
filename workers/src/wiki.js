/**
 * LLM Wiki 知识库模块 v4 — Handlers
 * 多知识库 + 分类-模板 1:1 绑定
 */
import JSZip from 'jszip';

// ====== helpers ======
function uuid() { return crypto.randomUUID(); }
async function readBody(request) { try { return await request.json(); } catch { return {}; } }
function json(obj, status = 200) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}

async function auth(request, env, JWT_SECRET) {
  const { authUser } = await import('./auth.js');
  return authUser(request, JWT_SECRET);
}

// ====== KB ======
export async function handleWikiListKbs(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const rows = await env.DB.prepare("SELECT id, title, created_at, updated_at FROM wiki_knowledge_bases WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.uid).all();
  return json({ kbs: rows.results });
}

export async function handleWikiAddKb(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { title } = await readBody(request);
  if (!title) return json({ error: "title required" }, 400);
  const now = Date.now();
  const id = uuid();
  await env.DB.prepare("INSERT INTO wiki_knowledge_bases (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)")
    .bind(id, user.uid, title, now, now).run();
  return json({ id, title, ok: true }, 201);
}

export async function handleWikiUpdateKb(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { title } = await readBody(request);
  const now = Date.now();
  await env.DB.prepare("UPDATE wiki_knowledge_bases SET title=?, updated_at=? WHERE id=? AND user_id=?")
    .bind(title, now, params.kb_id, user.uid).run();
  return json({ ok: true });
}

export async function handleWikiDeleteKb(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kbId = params.kb_id;
  // 级联删所有数据
  for (const t of ['wiki_pages', 'wiki_links', 'wiki_sources', 'wiki_categories']) {
    await env.DB.prepare(`DELETE FROM ${t} WHERE kb_id=? AND user_id=?`).bind(kbId, user.uid).run();
  }
  await env.DB.prepare("DELETE FROM wiki_knowledge_bases WHERE id=? AND user_id=?").bind(kbId, user.uid).run();
  return json({ ok: true });
}

// 校验 kb 归属
async function ensureKb(env, userId, kbId) {
  return env.DB.prepare("SELECT id, title FROM wiki_knowledge_bases WHERE id=? AND user_id=?").bind(kbId, userId).first();
}

// ====== Categories（含模板字段）======
export async function handleWikiListCategories(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const rows = await env.DB.prepare(
    "SELECT id, kb_id, name, slug, sort_order, extract_hints, page_format, created_at, updated_at FROM wiki_categories WHERE kb_id=? ORDER BY sort_order, created_at"
  ).bind(params.kb_id).all();
  return json({ categories: rows.results, kb });
}

// slug 自动生成 + extract_hints 自动生成
function autoSlug(name) {
  return name.toLowerCase().trim()
    .replace(/[\s,，。！？、；：""''（）()【】《》<>\/\\]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}
function autoExtractHints(pageFormat) {
  if (!pageFormat) return '';
  const placeholders = [...pageFormat.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1].trim());
  if (placeholders.length === 0) return '';
  return '提取 ' + placeholders.join('、');
}

export async function handleWikiAddCategory(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const body = await readBody(request);
  const { name, page_format = '' } = body;
  if (!name) return json({ error: "name required" }, 400);
  const now = Date.now();
  const id = uuid();
  const slug = body.slug || autoSlug(name);
  const extract_hints = body.extract_hints || autoExtractHints(page_format);
  await env.DB.prepare(
    "INSERT INTO wiki_categories (id, kb_id, user_id, name, slug, sort_order, extract_hints, page_format, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(id, params.kb_id, user.uid, name, slug, 0, extract_hints, page_format, now, now).run();

  // 自动创建模板页面，让知识库里立刻有东西看
  if (page_format) {
    const tplPageId = uuid();
    const tplTitle = `📋 ${name}（模板）`;
    const tplContent = `> 这是「${name}」分类的页面模板，AI 汇入资料时会按此格式生成页面。\n\n${page_format}\n\n---\n_待 AI 整理资料后自动生成内容_`;
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO wiki_pages (id, kb_id, user_id, category_id, title, content, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)"
      ).bind(tplPageId, params.kb_id, user.uid, id, tplTitle, tplContent, now, now).run();
    } catch (e) { /* 忽略：模板页面创建失败不影响分类 */ }
  }

  return json({ id, name, slug, ok: true }, 201);
}

export async function handleWikiUpdateCategory(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const { id, name, page_format } = body;
  if (!id) return json({ error: "id required" }, 400);
  const now = Date.now();
  const sets = []; const binds = [];
  if (name !== undefined) { sets.push('name=?'); binds.push(name); sets.push('slug=?'); binds.push(autoSlug(name)); }
  if (page_format !== undefined) {
    sets.push('page_format=?'); binds.push(page_format);
    sets.push('extract_hints=?'); binds.push(autoExtractHints(page_format));
  }
  if (sets.length === 0) return json({ ok: true });
  sets.push('updated_at=?'); binds.push(now);
  binds.push(id); binds.push(params.kb_id); binds.push(user.uid);
  await env.DB.prepare(`UPDATE wiki_categories SET ${sets.join(',')} WHERE id=? AND kb_id=? AND user_id=?`).bind(...binds).run();

  // 同步更新模板页面（如果改了 name 或 page_format）
  if (name !== undefined || page_format !== undefined) {
    try {
      const cat = await env.DB.prepare("SELECT name, page_format FROM wiki_categories WHERE id=?").bind(id).first();
      if (cat) {
        const tplContent = `> 这是「${cat.name}」分类的页面模板，AI 汇入资料时会按此格式生成页面。\n\n${cat.page_format}\n\n---\n_待 AI 整理资料后自动生成内容_`;
        const tplTitle = `📋 ${cat.name}（模板）`;
        await env.DB.prepare(
          "UPDATE wiki_pages SET content=?, title=?, updated_at=? WHERE category_id=? AND is_system=1 AND kb_id=? AND user_id=?"
        ).bind(tplContent, tplTitle, now, id, params.kb_id, user.uid).run();
      }
    } catch (e) { /* 忽略 */ }
  }

  return json({ ok: true });
}

export async function handleWikiDeleteCategory(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: "id required" }, 400);
  await env.DB.prepare("DELETE FROM wiki_categories WHERE id=? AND kb_id=? AND user_id=?")
    .bind(id, params.kb_id, user.uid).run();
  return json({ ok: true });
}

// ====== Sources ======
export async function handleWikiListSources(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const ingested = new URL(request.url).searchParams.get('ingested');
  let sql = "SELECT id, kind, ref_id, title, raw_text, ingested, ingested_at, created_at FROM wiki_sources WHERE kb_id=?";
  const binds = [params.kb_id];
  if (ingested !== null) { sql += " AND ingested=?"; binds.push(parseInt(ingested)); }
  sql += " ORDER BY created_at DESC";
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ sources: rows.results });
}

export async function handleWikiAddSourceText(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const { title, text } = await readBody(request);
  if (!text) return json({ error: "text required" }, 400);
  const now = Date.now();
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO wiki_sources (id, kb_id, user_id, kind, ref_id, title, raw_text, ingested, created_at) VALUES (?,?,?,?,?,?,?,0,?)"
  ).bind(id, params.kb_id, user.uid, 'text', null, title || '手动文本', text, now).run();
  return json({ id, ok: true }, 201);
}

// 文件上传：支持 .txt .md .docx .csv .html .json
export async function handleWikiUploadSourceFile(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);

  const ct = request.headers.get('content-type') || '';
  const ab = await request.arrayBuffer();
  let filename = 'upload';
  let rawContent = '';

  if (ct.startsWith('multipart/form-data')) {
    const body = new TextDecoder().decode(ab);
    const boundary = ct.split('boundary=')[1]?.replace(/^"|"$/g, '');
    if (!boundary) return json({ error: "no boundary" }, 400);
    const parts = body.split('--' + boundary);
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        const fnMatch = part.match(/filename="([^"]*)"/);
        if (fnMatch) filename = fnMatch[1];
        const bodyIdx = part.indexOf('\r\n\r\n');
        if (bodyIdx > -1) {
          const bodyStart = bodyIdx + 4;
          const bodyEnd = part.endsWith('\r\n') ? part.length - 2 : part.length;
          rawContent = part.slice(bodyStart, bodyEnd);
        }
      }
    }
  } else {
    filename = request.headers.get('x-filename') || 'upload';
  }

  // 按扩展名提取（docx 用 JSZip 从原始 ArrayBuffer 解）
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  let finalText = rawContent;

  try {
    if (ext === 'docx') {
      const zip = await JSZip.loadAsync(ab);
      const xmlFile = zip.file('word/document.xml');
      if (xmlFile) {
        const xmlText = await xmlFile.async('string');
        finalText = xmlText
          .replace(/<w:p[\s\S]*?<\/w:p>/g, m => {
            const texts = [...m.matchAll(/<w:t[^>]*>([^<]*?)<\/w:t>/g)].map(x => x[1]);
            return texts.join('');
          })
          .replace(/<[^>]+>/g, '')
          .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .split('\n').map(l => l.trim()).filter(Boolean).join('\n\n');
      } else {
        return json({ error: "docx 里找不到 word/document.xml" }, 400);
      }
    } else if (['txt','md','csv','html','json'].includes(ext)) {
      finalText = rawContent || new TextDecoder().decode(ab);
    } else if (ext === 'pdf') {
      return json({ error: "PDF 暂不支持（可以先复制文字粘贴）" }, 400);
    } else {
      finalText = rawContent || new TextDecoder().decode(ab);
    }
  } catch (e) {
    return json({ error: "文件解析失败：" + (e.message || "未知错误") }, 400);
  }

  if (!finalText.trim()) return json({ error: "文件内容为空" }, 400);

  const now = Date.now();
  const id = uuid();
  const title = filename.replace(/\.[^.]+$/, '');

  await env.DB.prepare(
    "INSERT INTO wiki_sources (id, kb_id, user_id, kind, ref_id, title, raw_text, ingested, created_at) VALUES (?,?,?,?,?,?,?,0,?)"
  ).bind(id, params.kb_id, user.uid, 'text', null, title, finalText.slice(0, 200000), now).run();
  return json({ id, ok: true, title, chars: finalText.length }, 201);
}

export async function handleWikiDeleteSource(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("DELETE FROM wiki_sources WHERE id=? AND kb_id=? AND user_id=?")
    .bind(params.source_id, params.kb_id, user.uid).run();
  return json({ ok: true });
}

export async function handleWikiBatchDeleteSources(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const { ids } = await readBody(request);
  if (!Array.isArray(ids) || ids.length === 0) return json({ error: "ids required" }, 400);
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(
    `DELETE FROM wiki_sources WHERE id IN (${placeholders}) AND kb_id=? AND user_id=?`
  ).bind(...ids, params.kb_id, user.uid).run();
  return json({ ok: true, deleted: ids.length });
}

// ====== 全局资料（标签式绑定） ======

// 全局列资料（可选 tags 过滤）
export async function handleWikiGlobalListSources(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const qp = new URL(request.url).searchParams;
  const tag = qp.get('tag');
  const ingested = qp.get('ingested');
  let sql = "SELECT id, kind, ref_id, title, raw_text, tags, ingested, ingested_at, kb_id, created_at FROM wiki_sources WHERE user_id=?";
  const binds = [user.uid];
  if (tag) {
    // tags LIKE 优先（新数据），同时兼容 kb_id=?（历史数据）
    sql += " AND (tags LIKE ? OR kb_id=?)";
    binds.push('%"' + tag + '"%', tag);
  }
  if (ingested !== null) { sql += " AND ingested=?"; binds.push(parseInt(ingested)); }
  sql += " ORDER BY created_at DESC";
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ sources: rows.results });
}

// 全局添加资料（kb_id 可选，tags 可选）
export async function handleWikiGlobalAddSource(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { title, text, kind = 'text', tags = [], kb_id = null } = await readBody(request);
  if (!text) return json({ error: "text required" }, 400);
  const now = Date.now();
  const id = uuid();
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : []);
  await env.DB.prepare(
    "INSERT INTO wiki_sources (id, kb_id, user_id, kind, ref_id, title, raw_text, tags, ingested, created_at) VALUES (?,?,?,?,?,?,?,?,0,?)"
  ).bind(id, kb_id, user.uid, kind, null, title || '手动文本', text.slice(0, 200000), tagsStr, now).run();
  return json({ id, ok: true });
}

// 全局删除资料（只按 id + user_id，不绑 kb_id）
export async function handleWikiGlobalDeleteSource(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("DELETE FROM wiki_sources WHERE id=? AND user_id=?")
    .bind(params.source_id, user.uid).run();
  return json({ ok: true });
}

// 更新资料的 tags
export async function handleWikiUpdateSourceTags(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { tags } = await readBody(request);
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : []);
  await env.DB.prepare("UPDATE wiki_sources SET tags=? WHERE id=? AND user_id=?")
    .bind(tagsStr, params.source_id, user.uid).run();
  return json({ ok: true });
}

// 日记保存 hook
export async function saveDiaryToWikiSources(env, diaryId, userId) {
  try {
    const diary = await env.DB.prepare("SELECT date, title, blocks FROM diaries WHERE id=? AND user_id=?").bind(diaryId, userId).first();
    if (!diary) return;
    // 日记归入用户最近创建的 KB（如果有）
    const kb = await env.DB.prepare("SELECT id FROM wiki_knowledge_bases WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    if (!kb) return; // 用户还没建 KB，不入

    const existing = await env.DB.prepare("SELECT 1 FROM wiki_sources WHERE kb_id=? AND kind='diary' AND ref_id=?").bind(kb.id, diaryId).first();
    if (existing) return;

    let rawText = '';
    try {
      const blocks = JSON.parse(diary.blocks || '[]');
      rawText = blocks.filter(b => b.kind === 'text').map(b => b.content).join('\n');
    } catch { rawText = diary.blocks || ''; }
    if (!rawText.trim()) return;

    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO wiki_sources (id, kb_id, user_id, kind, ref_id, title, raw_text, ingested, created_at) VALUES (?,?,?,?,?,?,?,0,?)"
    ).bind(uuid(), kb.id, userId, 'diary', diaryId, diary.title || `日记 ${diary.date}`, rawText, now).run();
  } catch (e) { console.error('[wiki] diary source fail:', e.message); }
}

// ====== Pages ======
export async function handleWikiListPages(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const category_id = new URL(request.url).searchParams.get('category_id');
  let sql = "SELECT id, category_id, title, content, summary, is_system, created_at, updated_at FROM wiki_pages WHERE kb_id=?";
  const binds = [params.kb_id];
  if (category_id) { sql += " AND category_id=?"; binds.push(category_id); }
  else { sql += " AND (is_system=0 OR is_system IS NULL)"; }
  sql += " ORDER BY updated_at DESC LIMIT 200";
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ pages: rows.results });
}

export async function handleWikiGetPage(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const page = await env.DB.prepare("SELECT * FROM wiki_pages WHERE id=? AND kb_id=? AND user_id=?")
    .bind(params.page_id, params.kb_id, user.uid).first();
  if (!page) return json({ error: "not found" }, 404);
  const outlinks = await env.DB.prepare("SELECT to_title, relation FROM wiki_links WHERE kb_id=? AND from_title=?")
    .bind(params.kb_id, page.title).all();
  const backlinks = await env.DB.prepare("SELECT from_title, relation FROM wiki_links WHERE kb_id=? AND to_title=?")
    .bind(params.kb_id, page.title).all();
  return json({ page, outlinks: outlinks.results, backlinks: backlinks.results });
}

// PATCH page — 用户手动编辑保存
export async function handleWikiUpdatePage(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { content, summary, title, category_id } = await readBody(request);

  const sets = [];
  const binds = [];
  if (content !== undefined) { sets.push("content=?"); binds.push(content); }
  if (summary !== undefined) { sets.push("summary=?"); binds.push(summary); }
  if (title !== undefined) { sets.push("title=?"); binds.push(title); }
  if (category_id !== undefined) { sets.push("category_id=?"); binds.push(category_id || null); }
  if (sets.length === 0) return json({ error: "nothing to update" }, 400);
  sets.push("updated_at=?"); binds.push(Date.now());
  binds.push(params.page_id, params.kb_id, user.uid);

  await env.DB.prepare(
    `UPDATE wiki_pages SET ${sets.join(",")} WHERE id=? AND kb_id=? AND user_id=? AND is_system=0`
  ).bind(...binds).run();

  return json({ ok: true });
}

// POST generate-entity — 给 AI 生成一个新实体页面
export async function handleWikiGenerateEntity(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const { entity_name, source_text, category_id } = await readBody(request);
  if (!entity_name || !source_text) return json({ error: "entity_name and source_text required" }, 400);

  // 拿范本
  let tplContent = "";
  let tplExtract = "";
  if (category_id) {
    const cat = await env.DB.prepare("SELECT name, extract_hints, page_format FROM wiki_categories WHERE id=? AND kb_id=?")
      .bind(category_id, params.kb_id).first();
    if (cat) {
      tplContent = cat.page_format || "";
      tplExtract = cat.extract_hints || "";
    }
  }

  // 看实体是否已存在
  const existing = await env.DB.prepare("SELECT id FROM wiki_pages WHERE kb_id=? AND title=?")
    .bind(params.kb_id, entity_name).first();
  if (existing) return json({ ok: true, already_exists: true, page_id: existing.id });

  // AI 生成
  const system = `你是一个知识整理助手。用户正在编辑知识库，发现了一个新实体需要你帮忙生成页面。
请用 Markdown 写一篇关于「${entity_name}」的简短页面。
${tplContent ? `请严格按以下模板格式（用 {{占位符}} 的地方要根据内容替换，没信息的段落可以删掉）：\n${tplContent}` : ''}
${tplExtract ? `提取提示：${tplExtract}` : ''}
资料来源（只有这些，不能编造）：
---
${source_text.slice(0, 3000)}
---
返回纯 Markdown，不要解释，不要 JSON，只写正文。要求：
1. 以 "# ${entity_name}" 开头
2. 用简洁的中文白话
3. 提到其他已有页面的地方用 [[页面名]] 链接
4. 如果模板里有 {{占位符}} 但资料里没有对应信息，就删掉那段`;

  const resp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    prompt: system,
    system: "你是严谨的知识整理助手，不编造信息。",
    max_tokens: 1500,
  });

  const md = (resp.response || "").trim();
  const summaryMatch = md.match(/^#\s+[^\n]+\n\n([^\n]{10,80})/m);
  const summary = summaryMatch ? summaryMatch[1] : "";
  const now = Date.now();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, summary, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)"
  ).bind(id, params.kb_id, user.uid, category_id || null, entity_name, md, summary, now, now).run();

  // 加链接（source_text 里应该提到了这个实体）
  const sourceTitleMatch = source_text.match(/^#\s+([^\n]+)/m);
  const sourceTitle = sourceTitleMatch ? sourceTitleMatch[1].trim() : "";
  if (sourceTitle && sourceTitle !== entity_name) {
    await env.DB.prepare("INSERT OR IGNORE INTO wiki_links (kb_id, user_id, from_title, to_title, relation, created_at) VALUES (?,?,?,?,?,?)")
      .bind(params.kb_id, user.uid, sourceTitle, entity_name, "提到", now).run();
  }

  return json({ ok: true, page_id: id, title: entity_name, content: md });
}

// ====== 图谱 ======
export async function handleWikiGraph(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);

  // 拿分类映射（category_id → 颜色）
  const catR = await env.DB.prepare(
    "SELECT id, name FROM wiki_categories WHERE kb_id=?"
  ).bind(params.kb_id).all();
  const catMap = Object.fromEntries(catR.results.map(c => [c.id, c.name]));

  // 节点
  const pageR = await env.DB.prepare(
    "SELECT id, title, category_id, is_system FROM wiki_pages WHERE kb_id=? AND user_id=?"
  ).bind(params.kb_id, user.uid).all();
  const nodes = pageR.results.map(p => ({
    id: p.id,
    title: p.title,
    category: p.category_id ? catMap[p.category_id] || null : null,
    is_system: !!p.is_system,
  }));

  // 连线（去重：A→B 和 B→A 合并为一条无向边）
  const linkR = await env.DB.prepare(
    "SELECT from_title, to_title FROM wiki_links WHERE kb_id=? AND user_id=?"
  ).bind(params.kb_id, user.uid).all();
  const seen = new Set();
  const links = [];
  for (const l of linkR.results) {
    const pair = [l.from_title, l.to_title].sort().join('||');
    if (seen.has(pair)) continue;
    seen.add(pair);
    links.push({ source: l.from_title, target: l.to_title });
  }

  return json({ nodes, links });
}

export async function handleWikiSearch(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const q = new URL(request.url).searchParams.get('q') || '';
  if (!q.trim()) return json({ results: [] });
  const rows = await env.DB.prepare(
    "SELECT id, title, substr(content,1,150) as summary, updated_at FROM wiki_pages WHERE kb_id=? AND is_system=0 AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 50"
  ).bind(params.kb_id, `%${q}%`, `%${q}%`).all();
  return json({ results: rows.results });
}

// ====== 核心：汇入 ======
function buildWikiSystemPrompt(kb, categories, existingPages) {
  let catSection = categories.map(c => `## ${c.name} (slug: ${c.slug})\n- 提取提示：${c.extract_hints}\n- 页面格式（Markdown）：\n${c.page_format}`).join('\n\n');
  if (!catSection) catSection = '（暂无分类，请按通用格式整理）';

  // 已有页面内容 — 让 AI 能真正"更新"而非盲吐
  let existingSection = '（知识库当前为空，首次汇入）';
  if (existingPages && existingPages.length > 0) {
    existingSection = existingPages.map(p =>
      `### [[${p.title}]]${p.category ? '（' + p.category + '）' : ''}\n${p.content}`
    ).join('\n\n---\n\n');
  }

  return `# 关于这个知识库
这是「${kb.title}」，你的任务是把零散的资料整理成一套相互关联、便于查找的笔记。

## 资料夹与文件功能说明
- 资料：存放用户上传的原始资料素材（包括日记和手动粘贴的文本），你只能读取、不能修改。
- 知识库：由你来建立、更新和整理，采用扁平式结构（依靠「目录.md」和「[[双向链接]]」来组织）。
  - 分类：${categories.map(c => c.name).join('、')}
  - 每个分类下的页面请使用对应的模板格式（见下方）。
- 目录.md：知识库的目录大纲，列出所有页面。
- 日志.md：每次更新追加一行。

## 用户的分类和模板
${catSection}

## 当前知识库已有的页面（请仔细阅读后再决定怎么处理新资料）
${existingSection}

## 资料汇入与整理规则
1. **先看上面已有页面**，判断新资料里的人物/事件是否已存在。
2. **已存在的 → 更新**：把新资料整合进去，返回的 content 必须是整合后的完整内容（包含旧信息 + 新资料补充的信息）。
3. **全新条目 → 新建**：严格按对应分类的模板格式写。
4. 页面内容严格按模板格式，用 Markdown（# 大标题、## 小标题、加粗、列表等）。
5. 每个页面至少用 [[页面名]] 链接一个相关页面，不能孤立。
6. 简单流畅的白话，不编造资料里没有的信息。

## 输出格式 — 严格 JSON，不要解释文字或 markdown 代码块
{
  "pages": [
    { "title": "页面标题(<=20字)", "category_slug": "分类slug", "action": "update", "summary": "一句话说明(<=40字)", "content": "整合后的完整Markdown内容" },
    { "title": "新页面标题", "category_slug": "分类slug", "action": "create",  "summary": "一句话说明(<=40字)", "content": "完整Markdown内容" }
  ],
  "links": [{ "from": "页面A", "to": "页面B" }],
  "log_entry": "[YYYY-MM-DD] 汇入资料｜处理N份，新建X页，更新Y页，链接Z条"
}

## 铁律
1. 只写 JSON，不写任何 JSON 之外的文字。
2. 每个页面都必须带 "summary" 字段（一句话说明，用于目录）。
3. **content 正文里凡是提到其他页面的地方，必须用 [[页面名]] 替换**。比如写「张飞」时提到刘备要写成 [[刘备]]，提到长坂坡之战要写成 [[长坂坡之战]]。links 字段也要返回结构化链接，但 **links 是补充，正文里的 [[xxx]] 才是主要链接方式**。
4. 绝不编造资料里没有的信息。
5. 绝不重复创建已有的页面（按标题判断），一律 action: "update"。
6. update 的 content 必须是整合旧页面 + 新资料后的**完整页面**，不能只写增量部分。

### content 里嵌入 [[链接]] 的示例
❌ 错误：- 参与长坂坡之战，兄弟是刘备和关羽。
✅ 正确：- 参与 [[长坂坡之战]]，兄弟是 [[刘备]] 和 [[关羽]]。

如果当前知识库已有页面 `[[刘备]]`、`[[关羽]]`、`[[长坂坡之战]]`，就必须用 `[[页面名]]` 引用；如果是新出现的、当前还没有的实体，第一次可以先写纯文本（但要在本次返回的 pages 里新建对应页面，这样下一次就能互相链接了）。`;
}

function stripJsonFences(text) {
  if (!text) return text;
  let t = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.substring(s, e + 1);
  return t;
}

export async function handleWikiIngestAll(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);

  // 支持 body: { ids: ['id1','id2'] } 只汇入选中的；不传 ids 或空数组就汇入全部待处理
  let bodyIds = null;
  try { const b = await readBody(request); if (Array.isArray(b.ids) && b.ids.length > 0) bodyIds = b.ids; } catch {}

  const categoriesR = await env.DB.prepare("SELECT * FROM wiki_categories WHERE kb_id=? ORDER BY sort_order").bind(params.kb_id).all();
  const categories = categoriesR.results;

  // 拉已有页面（让 AI 能判断哪些该更新）
  const catIdToName = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const existingR = await env.DB.prepare(
    "SELECT title, content, category_id FROM wiki_pages WHERE kb_id=? AND (is_system=0 OR is_system IS NULL) ORDER BY title"
  ).bind(params.kb_id).all();
  const existingPages = existingR.results.map(p => ({
    title: p.title,
    content: p.content,
    category: p.category_id ? catIdToName[p.category_id] || null : null,
  }));

  // 资料可以 kb_id 绑定 OR tags 打标签（全局化后的兼容）
  let sql = "SELECT * FROM wiki_sources WHERE ingested=0 AND (kb_id=? OR tags LIKE ? OR tags LIKE ?)";
  const binds = [params.kb_id, '%"' + params.kb_id + '"%', '%' + params.kb_id + '%'];
  if (bodyIds) {
    const ph = bodyIds.map(() => '?').join(',');
    sql += ` AND id IN (${ph})`;
    binds.push(...bodyIds);
  }
  sql += " ORDER BY created_at ASC";
  const pendingR = await env.DB.prepare(sql).bind(...binds).all();
  const pending = pendingR.results;
  if (pending.length === 0) return json({ ok: true, message: bodyIds ? "选中的资料都已汇入" : "没有待处理的资料" });

  const systemPrompt = buildWikiSystemPrompt(kb, categories, existingPages);
  const allPending = pending.map((s, i) => `--- 资料 ${i+1}：${s.title || (s.kind==='diary'?'日记':'文本')} (${s.kind}) ---\n${s.raw_text}`).join('\n\n');

  const BATCH_SIZE = 5;
  let allPages = [], allLinks = [], allLogs = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchMsg = batch.map((s, j) => `--- 资料 ${i+j+1}：${s.title || '资料'} (${s.kind}) ---\n${s.raw_text}`).join('\n\n');
    let result;
    try {
      result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请将资料汇入知识库\n\n${batchMsg}` }
        ],
        max_tokens: 4096
      });
    } catch (e) { console.error('[wiki] AI fail:', e.message); continue; }

    let parsed;
    try { parsed = JSON.parse(stripJsonFences(result.response || result.text || '')); }
    catch { console.error('[wiki] parse fail'); continue; }

    if (parsed.pages) allPages = allPages.concat(parsed.pages);
    if (parsed.links) allLinks = allLinks.concat(parsed.links);
    if (parsed.log_entry) allLogs.push(parsed.log_entry);
  }

  const now = Date.now();
  const slugToCatId = Object.fromEntries(categories.map(c => [c.slug, c.id]));
  const pendingSourceIds = pending.map(s => s.id);
  const newPages = [];
  let createdCount = 0, updatedCount = 0;

  // 收集 AI 返回的 title → summary 映射（用于后面生成目录）
  const summaryMap = new Map();

  for (const p of allPages) {
    if (!p.title) continue;
    const catId = slugToCatId[p.category_slug] || null;
    const summary = (p.summary || '').trim().slice(0, 80);
    if (summary) summaryMap.set(p.title, summary);

    // 先精确匹配，失败再模糊包含匹配（防 AI 给了「三国人物·张飞」vs 已有「张飞」）
    let existing = await env.DB.prepare("SELECT id, title, source_ids FROM wiki_pages WHERE kb_id=? AND title=?")
      .bind(params.kb_id, p.title).first();
    if (!existing) {
      // 模糊匹配：title 互相包含，取更短的那个（更通用的名称）
      const fuzzy = await env.DB.prepare(
        "SELECT id, title, source_ids FROM wiki_pages WHERE kb_id=? AND is_system=0 AND (title LIKE ? OR ? LIKE '%' || title || '%') ORDER BY length(title) ASC LIMIT 1"
      ).bind(params.kb_id, '%' + p.title + '%', p.title).first();
      if (fuzzy) {
        existing = fuzzy;
        // 用已有短名替换 AI 给的长名
        p.title = fuzzy.title;
      }
    }

    if (existing) {
      // 已有页面 → AI 应返回了整合后的完整 content，直接替换
      let prevSources = [];
      try { prevSources = JSON.parse(existing.source_ids || '[]'); } catch {}
      const allSources = Array.from(new Set([...prevSources, ...pendingSourceIds]));

      await env.DB.prepare(
        "UPDATE wiki_pages SET content=?, category_id=?, source_ids=?, summary=?, updated_at=? WHERE id=?"
      ).bind(p.content, catId, JSON.stringify(allSources), summary || null, now, existing.id).run();
      updatedCount++;
    } else {
      // 新页面
      const id = uuid();
      await env.DB.prepare(
        "INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, summary, source_ids, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?)"
      ).bind(id, params.kb_id, user.uid, catId, p.title, p.content, summary || null, JSON.stringify(pendingSourceIds), now, now).run();
      newPages.push({ id, title: p.title });
      createdCount++;
    }
  }

  // links
  const linkPairs = new Set();
  for (const l of allLinks) { if (l.from && l.to && l.from !== l.to) linkPairs.add(`${l.from}||${l.to}`); }
  const linkRe = /\[\[([^\]]+)\]\]/g;
  for (const p of allPages) {
    let m;
    while ((m = linkRe.exec(p.content || '')) !== null) {
      if (m[1] !== p.title) linkPairs.add(`${p.title}||${m[1]}`);
    }
  }
  for (const pair of linkPairs) {
    const [from, to] = pair.split('||');
    await env.DB.prepare("INSERT OR IGNORE INTO wiki_links (kb_id, user_id, from_title, to_title, relation, created_at) VALUES (?,?,?,?,?,?)")
      .bind(params.kb_id, user.uid, from, to, 'related', now).run();
  }

  // 目录.md
  const allPagesR = await env.DB.prepare("SELECT title, summary, category_id FROM wiki_pages WHERE kb_id=? AND (is_system=0 OR is_system IS NULL) ORDER BY category_id, title")
    .bind(params.kb_id).all();
  let catalog = `# 目录\n\n最后更新：${new Date(now).toISOString().slice(0,10)}\n\n`;
  for (const cat of categories) {
    const ps = allPagesR.results.filter(p => p.category_id === cat.id);
    if (ps.length > 0) {
      catalog += `## ${cat.name}\n`;
      for (const p of ps) {
        // 优先用数据库里的 summary，没有就从本次 AI 返回的 summaryMap 取
        const s = p.summary || summaryMap.get(p.title) || '';
        catalog += `- [[${p.title}]]${s ? ` — ${s}` : ''}\n`;
      }
      catalog += '\n';
    }
  }
  const catTitle = '目录';
  const ec = await env.DB.prepare("SELECT id FROM wiki_pages WHERE kb_id=? AND is_system=1 AND title=?").bind(params.kb_id, catTitle).first();
  if (ec) await env.DB.prepare("UPDATE wiki_pages SET content=?, updated_at=? WHERE id=?").bind(catalog, now, ec.id).run();
  else await env.DB.prepare("INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, is_system, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)")
    .bind(uuid(), params.kb_id, user.uid, null, catTitle, catalog, now, now).run();

  // 日志.md — 优先用 AI 返回的 log_entry，没有就硬编码拼
  const finalLog = allLogs.length > 0
    ? allLogs.join('\n') + '\n'
    : `[${new Date(now).toISOString().slice(0,10)}] 汇入资料｜${pending.length}份，新建${createdCount}页，更新${updatedCount}页\n`;
  const logTitle = '日志';
  const el = await env.DB.prepare("SELECT id, content FROM wiki_pages WHERE kb_id=? AND is_system=1 AND title=?").bind(params.kb_id, logTitle).first();
  if (el) await env.DB.prepare("UPDATE wiki_pages SET content=?, updated_at=? WHERE id=?").bind(el.content + finalLog, now, el.id).run();
  else await env.DB.prepare("INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, is_system, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)")
    .bind(uuid(), params.kb_id, user.uid, null, logTitle, '# 操作日志\n\n' + finalLog, now, now).run();

  // 标记已汇入 + 自动给 tags 追加 kb_id（支持一篇资料汇入多个 KB）
  for (const s of pending) {
    const row = await env.DB.prepare("SELECT tags FROM wiki_sources WHERE id=?").bind(s.id).first();
    let tags = [];
    try { tags = JSON.parse(row?.tags || '[]'); } catch { tags = []; }
    if (!Array.isArray(tags)) tags = [];
    if (!tags.includes(params.kb_id)) tags.push(params.kb_id);
    await env.DB.prepare("UPDATE wiki_sources SET ingested=1, ingested_at=?, tags=? WHERE id=?")
      .bind(now, JSON.stringify(tags), s.id).run();
  }

  // embedding（只给新建页面做，更新的跳过）
  for (const p of newPages) {
    try {
      const row = await env.DB.prepare("SELECT title, content FROM wiki_pages WHERE id=?").bind(p.id).first();
      if (!row) continue;
      const emb = await env.AI.run('@cf/baai/bge-m3', { text: row.title + '\n' + row.content.slice(0,500) });
      if (emb?.data?.[0]) await env.DB.prepare("UPDATE wiki_pages SET vector=? WHERE id=?").bind(JSON.stringify(emb.data[0]), p.id).run();
    } catch { /* skip */ }
  }

  return json({
    ok: true,
    ingested_count: pending.length,
    created: createdCount,
    updated: updatedCount,
    links_added: linkPairs.size,
    pages: allPages.map(p => ({ title: p.title, category_slug: p.category_slug, summary: p.summary || '' }))
  });
}

// ====== 范本库 v4.1 ======
export async function handleWikiListTemplates(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const { results: official } = await env.DB.prepare(
    "SELECT id, name, description, extract_hints, page_format, kind, builtin_key FROM wiki_templates WHERE user_id='system' AND kb_id IS NULL"
  ).all();
  const { results: mine } = await env.DB.prepare(
    "SELECT id, name, description, extract_hints, page_format, kind FROM wiki_templates WHERE user_id=? AND kb_id=?"
  ).bind(user.uid, params.kb_id).all();
  return json({ official, mine });
}

export async function handleWikiAddTemplate(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);
  const { name, description = '', extract_hints = '', page_format = '' } = await readBody(request);
  if (!name) return json({ error: "name required" }, 400);
  const now = Date.now();
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO wiki_templates (id, kb_id, user_id, name, description, extract_hints, page_format, kind, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(id, params.kb_id, user.uid, name, description, extract_hints, page_format, 'user', now, now).run();
  return json({ id, name, ok: true }, 201);
}

export async function handleWikiDeleteTemplate(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: "id required" }, 400);
  await env.DB.prepare("DELETE FROM wiki_templates WHERE id=? AND user_id=? AND kb_id=?")
    .bind(id, user.uid, params.kb_id).run();
  return json({ ok: true });
}

export async function handleWikiBindTemplate(request, env, JWT_SECRET, params) {
  // 把范本的 extract_hints/page_format 复制到分类（不是引用！）
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const { template_id, category_id } = body;
  if (!template_id || !category_id) return json({ error: "template_id and category_id required" }, 400);

  // 范本可以是官方（user_id='system', kb_id is null）或用户自建
  const tpl = await env.DB.prepare(
    "SELECT extract_hints, page_format FROM wiki_templates WHERE id=? AND (user_id='system' OR (user_id=? AND kb_id=?))"
  ).bind(template_id, user.uid, params.kb_id).first();
  if (!tpl) return json({ error: "template not found" }, 404);

  const now = Date.now();
  const info = await env.DB.prepare("UPDATE wiki_categories SET extract_hints=?, page_format=?, updated_at=? WHERE id=? AND kb_id=? AND user_id=?")
    .bind(tpl.extract_hints, tpl.page_format, now, category_id, params.kb_id, user.uid).run();
  if (info.meta.changes === 0) return json({ error: "category not found" }, 404);

  return json({ ok: true });
}
