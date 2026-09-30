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

// ====== DB 日志（tail 连不上时的替代日志通路） ======
async function dblog(env, tag, msg, data = null) {
  try {
    await env.DB.prepare(
      "INSERT INTO wiki_debug_log (id, ts, tag, msg, data) VALUES (?,?,?,?,?)"
    ).bind(uuid(), Date.now(), tag, String(msg).slice(0, 500), data !== null ? JSON.stringify(data).slice(0, 2000) : null).run();
  } catch {}
}

async function auth(request, env, JWT_SECRET) {
  const { authUser } = await import('./auth.js');
  return authUser(request, JWT_SECRET);
}

// ====== AI 调用（优先 Agnes，fallback Workers AI，temperature 低保证 JSON 稳定） ======
const WIKI_LLM_MODEL = 'agnes-3.0-flash';
const WIKI_WORKERS_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
async function wikiCallLLM(env, messages, maxTokens = 4096) {
  const endpoint = String(env.AGNES_ENDPOINT || '').replace(/^\uFEFF+/, '').trim();
  const apiKey = String(env.AGNES_API_KEY || '').replace(/^\uFEFF+/, '').trim();
  await dblog(env, 'ingest', 'LLM_ENV', { hasEndpoint: !!endpoint, hasKey: !!apiKey, endpointPrefix: endpoint.slice(0, 30), model: WIKI_LLM_MODEL });
  console.log('[wiki] wikiCallLLM:', { hasEndpoint: !!endpoint, hasKey: !!apiKey, model: WIKI_LLM_MODEL, maxTokens });
  if (apiKey && endpoint) {
    //  Agnes 带 2 次重试（429 或网络问题时等 1.5s 再试）
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await dblog(env, 'ingest', 'LLM_AGNES_RETRY', { attempt });
        console.warn('[wiki] Agnes retry attempt', attempt);
        await new Promise(r => setTimeout(r, 1500));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: WIKI_LLM_MODEL, messages, max_tokens: maxTokens, temperature: 0.1 }),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        // 网络异常也重试
        if (attempt < MAX_RETRIES) continue;
        console.warn('[wiki] Agnes 网络异常，fallback Workers AI:', e.message);
        await dblog(env, 'ingest', 'LLM_AGNES_EXCEPTION', { msg: e.message });
        break;
      }
      clearTimeout(timer);
      console.log('[wiki] Agnes status:', res.status);

      // 429 重试；其他非 2xx 也重试一次
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('[wiki] Agnes HTTP', res.status, errText.slice(0, 200));
        await dblog(env, 'ingest', 'LLM_AGNES_HTTP_ERR', { status: res.status, err: errText.slice(0, 200) });
        if (attempt < MAX_RETRIES) continue;
        break; // 最后一次也失败了，fallback
      }

      // 成功
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      console.log('[wiki] Agnes content preview:', (content || '').slice(0, 100));
      if (content) {
        await dblog(env, 'ingest', 'LLM_AGNES_OK', { contentLen: content.length });
        return content;
      }
      await dblog(env, 'ingest', 'LLM_AGNES_EMPTY', { respPreview: JSON.stringify(data).slice(0, 200) });
      if (attempt < MAX_RETRIES) continue;
      break;
    }
  } else {
    await dblog(env, 'ingest', 'LLM_NO_SECRETS', { hasEndpoint: !!endpoint, hasKey: !!apiKey });
  }
  // fallback: Workers AI
  console.log('[wiki] fallback Workers AI llama-3.1-8b');
  await dblog(env, 'ingest', 'LLM_FALLBACK_WORKERS', { model: WIKI_WORKERS_MODEL });
  const r = await env.AI.run(WIKI_WORKERS_MODEL, { messages, max_tokens: maxTokens, temperature: 0.1 });
  return r.response || '';
}

// ====== KB ======
export async function handleWikiListKbs(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  // 自动 seed：确保所有 active 的官方预设都存在（幂等，已有则跳过）
  try {
    for (const preset of OFFICIAL_KB_PRESETS) {
      if (preset.active !== false) await seedOfficialPreset(env, user.uid, preset);
    }
  } catch (e) {
    console.error('[wiki] auto-seed failed, continue to list kbs:', e);
  }

  const rows = await env.DB.prepare("SELECT id, slug, title, description, is_official, created_at, updated_at FROM wiki_knowledge_bases WHERE user_id = ? ORDER BY updated_at DESC, is_official DESC")
    .bind(user.uid).all();
  console.log('[wiki] listKbs uid=', user.uid, 'count=', rows.results.length);
  return json({ kbs: rows.results });
}

export async function handleWikiAddKb(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { title, description } = await readBody(request);
  if (!title) return json({ error: "title required" }, 400);
  const now = Date.now();
  const id = uuid();
  await env.DB.prepare("INSERT INTO wiki_knowledge_bases (id, user_id, title, description, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .bind(id, user.uid, title, description || '', now, now).run();
  return json({ id, title, description: description || '', ok: true }, 201);
}

export async function handleWikiUpdateKb(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const now = Date.now();
  const sets = [];
  const args = [];
  if (body.title !== undefined) { sets.push('title=?'); args.push(body.title); }
  if (body.description !== undefined) { sets.push('description=?'); args.push(body.description); }
  if (sets.length === 0) return json({ ok: true });
  sets.push('updated_at=?');
  args.push(now, params.kb_id, user.uid);
  await env.DB.prepare(`UPDATE wiki_knowledge_bases SET ${sets.join(', ')} WHERE id=? AND user_id=?`)
    .bind(...args).run();
  return json({ ok: true });
}

export async function handleWikiDeleteKb(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kbId = params.kb_id;

  // 官方 KB 不让删
  const kb = await env.DB.prepare("SELECT is_official FROM wiki_knowledge_bases WHERE id=? AND user_id=?").bind(kbId, user.uid).first();
  if (!kb) return json({ error: "kb not found" }, 404);
  if (kb.is_official) return json({ error: "官方知识库不可删除" }, 403);

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
    const tplContent = `> 这是「${name}」分类的页面模板，小麦 汇入资料时会按此格式生成页面。\n\n${page_format}\n\n---\n_待小麦 整理资料后自动生成内容_`;
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
  const { id, name, page_format, extract_hints } = body;
  if (!id) return json({ error: "id required" }, 400);
  const now = Date.now();
  const sets = []; const binds = [];
  if (name !== undefined) { sets.push('name=?'); binds.push(name); sets.push('slug=?'); binds.push(autoSlug(name)); }
  if (page_format !== undefined) {
    sets.push('page_format=?'); binds.push(page_format);
    // 只有调用方没显式传 extract_hints 时才 auto 生成（调用方传了就尊重它的）
    if (extract_hints === undefined) { sets.push('extract_hints=?'); binds.push(autoExtractHints(page_format)); }
  }
  if (extract_hints !== undefined) { sets.push('extract_hints=?'); binds.push(extract_hints); }
  if (sets.length === 0) return json({ ok: true });
  sets.push('updated_at=?'); binds.push(now);
  binds.push(id); binds.push(params.kb_id); binds.push(user.uid);
  await env.DB.prepare(`UPDATE wiki_categories SET ${sets.join(',')} WHERE id=? AND kb_id=? AND user_id=?`).bind(...binds).run();

  // 同步更新模板页面（如果改了 name 或 page_format）
  if (name !== undefined || page_format !== undefined) {
    try {
      const cat = await env.DB.prepare("SELECT name, page_format FROM wiki_categories WHERE id=?").bind(id).first();
      if (cat) {
        const tplContent = `> 这是「${cat.name}」分类的页面模板，小麦 汇入资料时会按此格式生成页面。\n\n${cat.page_format}\n\n---\n_待小麦 整理资料后自动生成内容_`;
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
  const outlinks = await env.DB.prepare(`
    SELECT l.to_title, l.relation, p.id AS to_page_id, p.is_system AS to_is_system
    FROM wiki_links l
    LEFT JOIN wiki_pages p ON p.kb_id=l.kb_id AND p.user_id=l.user_id AND p.title=l.to_title
    WHERE l.kb_id=? AND l.from_title=?
  `).bind(params.kb_id, page.title).all();
  const backlinks = await env.DB.prepare(`
    SELECT l.from_title, l.relation, p.id AS from_page_id, p.is_system AS from_is_system
    FROM wiki_links l
    LEFT JOIN wiki_pages p ON p.kb_id=l.kb_id AND p.user_id=l.user_id AND p.title=l.from_title
    WHERE l.kb_id=? AND l.to_title=?
  `).bind(params.kb_id, page.title).all();
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

// DELETE /wiki/:kb_id/pages/:page_id — 删除单个页面（同时清理 wiki_links 关联）
export async function handleWikiDeletePage(request, env, JWT_SECRET, params) {
  console.log("[DELETE PAGE] params:", JSON.stringify(params));
  const user = await auth(request, env, JWT_SECRET);
  if (!user) { console.log("[DELETE PAGE] unauthorized"); return json({ error: "unauthorized" }, 401); }
  console.log("[DELETE PAGE] user.uid:", user.uid);
  const pageId = params.page_id;
  if (!pageId) return json({ error: "page_id required" }, 400);

  // 先拿页面信息，确认归属和非系统页
  const page = await env.DB.prepare("SELECT id, title, is_system FROM wiki_pages WHERE id=? AND kb_id=? AND user_id=?")
    .bind(pageId, params.kb_id, user.uid).first();
  console.log("[DELETE PAGE] page lookup result:", page ? JSON.stringify(page) : "NULL");
  if (!page) return json({ error: "page not found" }, 404);
  if (page.is_system === 1) return json({ error: "system page cannot be deleted" }, 400);

  // 删页面 + 清理双向链接（wiki_links 存的是 title，不是 page_id）
  const delPage = await env.DB.prepare("DELETE FROM wiki_pages WHERE id=? AND kb_id=? AND user_id=?")
    .bind(pageId, params.kb_id, user.uid).run();
  console.log("[DELETE PAGE] deleted rows:", delPage.changes);
  const delLinks = await env.DB.prepare("DELETE FROM wiki_links WHERE (from_title=? OR to_title=?) AND kb_id=?")
    .bind(page.title, page.title, params.kb_id).run();
  console.log("[DELETE PAGE] link rows deleted:", delLinks.changes);

  return json({ ok: true, deleted_title: page.title });
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

  const md = await wikiCallLLM(env, [
    { role: 'system', content: system },
    { role: 'user', content: source_text }
  ], 1500).then(s => (s || '').trim());
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
  // 检测是否为数学题库（分类 slug 含 zhishidian + jieti-fangfa）
  const slugs = new Set(categories.map(c => c.slug));
  const isMathKB = slugs.has('zhishidian') && slugs.has('jieti-fangfa');

  let catSection = categories.map(c => {
    // 剥掉模板第一行的 `# {{xxx}}\n`——title 字段已经是页面标题，content 从 ## 开始
    const fmt = (c.page_format || '').replace(/^#\s*[^\n]*\n+/, '');
    return `## ${c.name} (slug: ${c.slug})\n- 提取提示：${c.extract_hints}\n- 页面格式（Markdown，模板的第一行#标题已自动省略，正文直接从 ## 开始）：\n${fmt}`;
  }).join('\n\n');
  if (!catSection) catSection = '（暂无分类，请按通用格式整理）';

  // 已有页面 title 列表（只传标题+分类，不传 content，防止 AI 因"内容一样"就跳过 update / 跳过技巧拆分）
  // 代码侧会按 title 做精确/模糊匹配，content 整合也由代码处理
  let existingSection = '（知识库当前为空，首次汇入）';
  if (existingPages && existingPages.length > 0) {
    // 按分类分组展示，清晰易读
    const grouped = {};
    for (const p of existingPages) {
      const cat = p.category || '未分类';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p.title);
    }
    existingSection = Object.entries(grouped)
      .map(([cat, titles]) => `- **${cat}**：${titles.map(t => `[[${t}]]`).join('、')}`)
      .join('\n');
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
2. **已存在的 → 必须 update**：只要新资料里有**任何一点**新信息（哪怕是小贴士、评价、或做法上的细微差异），都必须返回 \`action: "update"\`，content 是整合旧页面完整内容 + 新资料补充后的**新版本**。**不能因为"差不多"就跳过**。
3. **全新条目 → 新建**：严格按对应分类的模板格式写。
4. **同一实体出现在多份资料里时，必须单独建页**（不管它看起来多"次要"）。例如"番茄"在番茄炒蛋、土豆烧排骨里都出现了，就必须在"食材"分类下建"番茄"页面，而不是只在菜谱正文里提 [[番茄]]。
5. **技巧独立建页**：资料里每道菜都有「烹饪技巧/小贴士」段落，**不要只写在菜谱的 [[链接]] 里**——要把这些技巧按**类型合并**，在「烹饪技巧」分类下独立建页。例如：
   - 5 道菜都提到"上浆/腌料"相关 → 合并建《肉丝上浆技巧》页
   - 多道菜提到"火候控制" → 合并建《大火快炒火候》页
   - 清蒸鲈鱼有"去腥技巧" → 独立建《蒸鱼去腥技巧》页
   技巧页的 title 要**具体可检索**（如"蒸鱼去腥技巧"而非"技巧1"），content 里引用 [[清蒸鲈鱼]] [[番茄炒蛋]] 等关联菜谱。
6. **仅在单份资料里顺带提及、且无独立主题的实体**（比如"适量盐"、"少许油"这种泛指或微不足道的东西），可以不单独建页，只在正文里加 [[链接]] 即可。
7. 页面内容严格按模板格式，用 Markdown（## 小标题、### 小节、加粗、列表等）。**注意：content 开头绝对不能出现 # 大标题——title 字段已经是页面标题了。模板里如果第一行是井号加大括号占位符（比如"# 菜名"），生成时直接跳过那行，正文从模板的第一个 ## 开始。**
8. **双向链接原则**：如果页面 A 的 content 里写了 [[B]]，页面 B 的 content 里也必须写 [[A]]。所有跨页面的关系必须双向显式声明，不能只单边链接。比如布洛芬写了 [[胃胀气]]，胃胀气也必须写 [[布洛芬]]。
9. 简单流畅的白话，不编造资料里没有的信息。
${isMathKB ? `

## 📐 数学题库专属规则（本知识库启用）
本知识库是数学解题知识库，汇入资料时必须遵循以下额外规则：

### 年级分类（一年级 → 六年级）
- **先判断年级**：根据题目难度、数字大小、运算类型自动归入对应年级分类。如果资料里明确写了"年级：三年级"，直接用；没写的由你判断。
- 一~二年级：百以内加减法、表内乘除、简单图形
- 三~四年级：多位数乘除、分数初步、运算律
- 五~六年级：小数、方程、面积体积、比例

### 知识点分类（独立成页）
- 从每道题里**抽出所有涉及的知识点**（如"除法"、"平均分"、"行程问题"），在「知识点」分类下新建或 update。
- 同一知识点出现在多道题里时，**必须 update 已有页面**，把新的题目加到"常见题型"里，不要重复创建。
- 知识点页面的 content 里必须用 [[题目名]] 链接到用到它的每道题。

### 解题方法分类（独立成页）
- **从多道题里归纳通用解法**。如果 3 道以上的题都用了"画图法"解题，就在「解题方法」分类下建《画图法》页。
- 解题方法页的 title 要**具体**（如"画图法解行程问题"而非"方法1"）。
- 每道题目里的"解题思路"必须和对应的方法页互相 [[双向链接]]。

### 题目页面
- title 要**概括性强**（如"小明分 24 颗糖"而非"数学题1"）。
- content 里"所属知识点"部分必须列出所有涉及的知识点名称，并用 [[知识点名]] 链接。
- "年级"字段如果资料里没写，由你根据难度判断填写。
- 豆包等外部 AI 生成的回答里可能有"1. 题目 2. 知识点 3. 解题思路"这种编号结构，直接提取对应段落即可，不要重新组织。
- **禁止 LaTeX 数学标记**：不要用任何反斜杠开头的数学公式标记，也不要用 $ 包围数学表达式。所有数学表达式用纯文本写，如 "84 / 4 = 21"、"最大公因数是 2"、"2 x 3 x 7 = 42"。
- **模板占位符替换**：如果 page_format 里有双大括号占位符（提示文字），不要原样复制——把占位符当说明，实际内容填真实值（如 "五年级"）。
` : ''}

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

如果当前知识库已有页面 \`[[刘备]]\`、\`[[关羽]]\`、\`[[长坂坡之战]]\`，就必须用 \`[[页面名]]\` 引用；如果是新出现的、当前还没有的实体，第一次可以先写纯文本（但要在本次返回的 pages 里新建对应页面，这样下一次就能互相链接了）。`;
}

function stripJsonFences(text) {
  if (!text) return text;
  let t = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.substring(s, e + 1);
  return t;
}

// AI 输出的 JSON 常见问题：content 里有实际换行符、引号未转义、尾部被截断
// 用正则逐字段提取 pages 数组，绕过 JSON.parse 的严格限制
function repairAiJson(text) {
  if (!text) return null;
  // 先试原生 parse
  try { return JSON.parse(stripJsonFences(text)); } catch {}

  const stripped = stripJsonFences(text);

  // 预处理：把字符串内部的裸反斜杠（JSON 不认识的）转义
  // JSON 合法转义只有：\" \\ \/ \b \f \n \r \t \uXXXX
  let escaped = stripped.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(?=\s*[:\[\],}])/g, (m, inner) => {
    // 把字符串内部所有裸反斜杠（不是合法 JSON 转义的）转义成双反斜杠
    // 先处理 LaTeX 常见标记：\( \) \[ \] \frac \times 等
    let fixed = inner
      // 裸反斜杠（后面不是合法 JSON 转义）→ 双反斜杠
      .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
      // 把字符串内部的裸换行替换为 \n
      .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    return '"' + fixed + '"';
  });
  try { return JSON.parse(escaped); } catch {}

  // 最后一招：暴力截断到最后一个完整的 }
  const lastBrace = stripped.lastIndexOf('}');
  if (lastBrace > 0) {
    const truncated = stripped.substring(0, lastBrace + 1);
    // 同样的预处理
    let tEscaped = truncated.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(?=\s*[:\[\],}])/g, (m, inner) => {
      let fixed = inner
        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
        .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      return '"' + fixed + '"';
    });
    try { return JSON.parse(tEscaped); } catch {}
    try { return JSON.parse(truncated); } catch {}
  }
  return null;
}

export async function handleWikiIngestAll(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const kb = await ensureKb(env, user.uid, params.kb_id);
  if (!kb) return json({ error: "kb not found" }, 404);

  await dblog(env, 'ingest', 'START', { kb_id: params.kb_id, kb_title: kb.title, newCode: true });

  // 支持 body: { ids: ['id1','id2'] } 只汇入选中的；不传 ids 或空数组就汇入全部待处理
  let bodyIds = null;
  try { const b = await readBody(request); if (Array.isArray(b.ids) && b.ids.length > 0) bodyIds = b.ids; } catch {}

  const categoriesR = await env.DB.prepare("SELECT * FROM wiki_categories WHERE kb_id=? ORDER BY sort_order").bind(params.kb_id).all();
  const categories = categoriesR.results;
  await dblog(env, 'ingest', 'CATEGORIES_LOADED', { count: categories.length, slugs: categories.map(c => c.slug) });

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
  // 有 bodyIds 时：OR 并列 id IN 和 kb/tags 条件，让裸资料(kb_id=null, tags=[])也能被命中
  let sql, binds;
  if (bodyIds) {
    const ph = bodyIds.map(() => '?').join(',');
    sql = `SELECT * FROM wiki_sources WHERE ingested=0 AND (id IN (${ph}) OR kb_id=? OR tags LIKE ? OR tags LIKE ?)`;
    binds = [...bodyIds, params.kb_id, '%"' + params.kb_id + '"%', '%' + params.kb_id + '%'];
  } else {
    // source 归属判定：kb_id 直接绑 OR tags 里打过 kb_id 标签都算有效
    // 只有 kb_id IS NULL 且 tags 里也没有 kb_id 的才是"无主"source，不能被自动匹配进任何 KB
    sql = "SELECT * FROM wiki_sources WHERE ingested=0 AND (kb_id=? OR tags LIKE ? OR tags LIKE ?)";
    binds = [params.kb_id, '%"' + params.kb_id + '"%', '%' + params.kb_id + '%'];
  }
  sql += " ORDER BY created_at ASC";
  const pendingR = await env.DB.prepare(sql).bind(...binds).all();
  const pending = pendingR.results;
  await dblog(env, 'ingest', 'PENDING_QUERIED', { count: pending.length, ids: pending.map(s => s.id) });
  if (pending.length === 0) {
    await dblog(env, 'ingest', 'DONE_NO_PENDING');
    return json({ ok: true, message: bodyIds ? "选中的资料都已汇入" : "没有待处理的资料" });
  }

  const systemPrompt = buildWikiSystemPrompt(kb, categories, existingPages);
  const allPending = pending.map((s, i) => `--- 资料 ${i+1}：${s.title || (s.kind==='diary'?'日记':'文本')} (${s.kind}) ---\n${s.raw_text}`).join('\n\n');

  const BATCH_SIZE = 5;
  let allPages = [], allLinks = [], allLogs = [], debugRaws = [];
  const processedSourceIds = new Set(); // 只标记实际处理成功的 source
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchMsg = batch.map((s, j) => `--- 资料 ${i+j+1}：${s.title || '资料'} (${s.kind}) ---\n${s.raw_text}`).join('\n\n');
    let rawText;
    try {
      rawText = await wikiCallLLM(env, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请将资料汇入知识库\n\n${batchMsg}` }
      ], 8192);
      console.log('[wiki] batch', i, 'rawText preview:', (rawText || '').slice(0, 300));
      await dblog(env, 'ingest', 'AI_RAW', { batch: i, preview: (rawText || '').slice(0, 500) });
      debugRaws.push({ batch: i, rawTextLen: rawText?.length || 0, preview: (rawText || '').slice(0, 500) });
    } catch (e) { console.error('[wiki] AI fail:', e.message); await dblog(env, 'ingest', 'AI_FAIL', { batch: i, error: e.message }); debugRaws.push({ batch: i, error: e.message }); continue; }

    let parsed = repairAiJson(rawText || '');
    if (!parsed) {
      console.error('[wiki] parse fail, raw tail:', (rawText || '').slice(-500));
      // 存完整 raw 到日志（dblog 的 data 字段能撑下 ~10KB）
      await dblog(env, 'ingest', 'PARSE_FAIL', { batch: i, rawLen: rawText?.length || 0, raw: (rawText || '').slice(0, 8000) });
      debugRaws.push({ batch: i, parseError: true, rawLen: rawText?.length || 0 });
      continue;
    }

    // Normalize: AI sometimes groups by category slug instead of returning pages array
    // or returns empty pages array but has category keys at top level
    const validSlugs = new Set(categories.map(c => c.slug));
    const hasGroupedKeys = Object.keys(parsed).some(k => validSlugs.has(k));
    if ((!Array.isArray(parsed.pages) || parsed.pages.length === 0) && hasGroupedKeys) {
      const normalizedPages = [];
      for (const [key, val] of Object.entries(parsed)) {
        if (!validSlugs.has(key)) continue;
        if (!val || typeof val !== 'object') continue;
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && item.title) {
              normalizedPages.push({ category_slug: key, action: 'create', summary: item.summary || '', content: item.content || '', ...item });
            }
          }
        } else if (val.title) {
          normalizedPages.push({ category_slug: key, action: 'create', summary: val.summary || '', content: val.content || JSON.stringify(val), ...val });
        } else {
          for (const [name, detail] of Object.entries(val)) {
            if (typeof detail === 'string') {
              normalizedPages.push({ title: name, category_slug: key, action: 'create', summary: detail.slice(0, 60), content: '## ' + name + '\n\n' + detail });
            } else if (detail && typeof detail === 'object') {
              const md = Object.entries(detail).map(([k,v]) => `- **${k}**：${Array.isArray(v) ? v.join('、') : v}`).join('\n');
              normalizedPages.push({ title: name, category_slug: key, action: 'create', summary: '', content: '## ' + name + '\n\n' + md });
            }
          }
        }
      }
      parsed.pages = normalizedPages;
      console.log('[wiki] normalized from grouped format:', normalizedPages.length, 'pages');
      await dblog(env, 'ingest', 'NORMALIZED', { batch: i, pages: normalizedPages.length, first: normalizedPages[0]?.title || null });
    }

    console.log('[wiki] parsed:', { pages: parsed.pages?.length, links: parsed.links?.length, firstTitle: parsed.pages?.[0]?.title || null });
    await dblog(env, 'ingest', 'PARSED_OK', { batch: i, pages: parsed.pages?.length || 0, links: parsed.links?.length || 0, page_cats: (parsed.pages || []).map(p => ({ title: p.title, slug: p.category_slug })) });

    // ===== 代码侧校验（补 AI 可能跑偏的地方）=====
    if (Array.isArray(parsed.pages)) {
      const validSlugsSet = new Set(categories.map(c => c.slug));
      const defaultCatSlug = categories[0]?.slug || null; // 兜底：第一个分类
      const fixedPages = [];
      for (const p of parsed.pages) {
        // 1) slug 白名单校验
        if (!p.category_slug || !validSlugsSet.has(p.category_slug)) {
          await dblog(env, 'ingest', 'SLUG_INVALID', { batch: i, title: p.title, badSlug: p.category_slug, validSlugs: [...validSlugsSet] });
          if (defaultCatSlug) {
            p.category_slug = defaultCatSlug;
            await dblog(env, 'ingest', 'SLUG_FALLBACK', { batch: i, title: p.title, fallbackSlug: defaultCatSlug });
          } else {
            p.category_slug = null; // 彻底没有分类时，写入后 category_id 就是 null
          }
        }
        fixedPages.push(p);
      }
      parsed.pages = fixedPages;
      await dblog(env, 'ingest', 'VALIDATED', { batch: i, pages: parsed.pages.length, validSlugs: [...validSlugsSet] });
    }
    // =============================================

    await dblog(env, 'ingest', 'BATCH_END', { batch: i, hasPages: !!parsed.pages, pageCount: parsed.pages?.length || 0, hasLinks: !!parsed.links });
    if (parsed.pages) allPages = allPages.concat(parsed.pages);
    if (parsed.links) allLinks = allLinks.concat(parsed.links);
    if (parsed.log_entry) allLogs.push(parsed.log_entry);
    batch.forEach(s => processedSourceIds.add(s.id)); // batch 处理成功才标记
  }

  const now = Date.now();
  const slugToCatId = Object.fromEntries(categories.map(c => [c.slug, c.id]));
  const pendingSourceIds = pending.map(s => s.id);
  const newPages = [];
  let createdCount = 0, updatedCount = 0;
  const pageDebug = []; // 每一页的处理轨迹
  await dblog(env, 'ingest', 'BEFORE_PAGE_LOOP', { allPages: allPages.length, allLinks: allLinks.length });

  // 收集 AI 返回的 title → summary 映射（用于后面生成目录）
  const summaryMap = new Map();

  for (const p of allPages) {
    if (!p.title) { pageDebug.push({ title: '(empty)', branch: 'skip-no-title' }); continue; }
    const catId = slugToCatId[p.category_slug] || null;
    const summary = (p.summary || '').trim().slice(0, 80);
    if (summary) summaryMap.set(p.title, summary);
    pageDebug.push({ title: p.title, category_slug: p.category_slug, catIdFound: !!catId, contentLen: (p.content || '').length });
    await dblog(env, 'ingest', 'PAGE_LOOP_ENTER', { title: p.title, slug: p.category_slug, catId, contentLen: (p.content || '').length });

    try {
      // 先精确匹配，失败再在 JS 里做模糊包含匹配（防 AI 给了「三国人物·张飞」vs 已有「张飞」）
      let existing = await env.DB.prepare("SELECT id, title, source_ids, category_id FROM wiki_pages WHERE kb_id=? AND title=?")
        .bind(params.kb_id, p.title).first();
      if (!existing) {
        // 安全地查出所有已有 pages，在 JS 里做模糊匹配（避免 SQLite LIKE pattern 过复杂）
        const allExisting = await env.DB.prepare(
          "SELECT id, title, source_ids, category_id FROM wiki_pages WHERE kb_id=? AND is_system=0 AND LENGTH(title) < LENGTH(?)"
        ).bind(params.kb_id, p.title).all();
        let best = null;
        for (const row of allExisting.results) {
          if (p.title.includes(row.title)) {
            if (!best || row.title.length > best.title.length) best = row; // 取最长匹配
          }
        }
        if (best) {
          existing = best;
          pageDebug[pageDebug.length-1].fuzzyMatch = best.title;
          p.title = best.title;
        }
      }

      if (existing) {
        let prevSources = [];
        try { prevSources = JSON.parse(existing.source_ids || '[]'); } catch {}
        const allSources = Array.from(new Set([...prevSources, ...pendingSourceIds]));
        await dblog(env, 'ingest', 'PAGE_UPDATE', { title: p.title, slug: p.category_slug, catId: catId, existingCatId: existing.category_id });
        await env.DB.prepare(
          "UPDATE wiki_pages SET content=?, category_id=?, source_ids=?, summary=?, updated_at=? WHERE id=?"
        ).bind(p.content, catId, JSON.stringify(allSources), summary || null, now, existing.id).run();
        updatedCount++;
        pageDebug[pageDebug.length-1].branch = 'update';
      } else {
        const id = uuid();
        await dblog(env, 'ingest', 'PAGE_INSERT', { title: p.title, slug: p.category_slug, catId: catId });
        await env.DB.prepare(
          "INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, summary, source_ids, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?)"
        ).bind(id, params.kb_id, user.uid, catId, p.title, p.content, summary || null, JSON.stringify(pendingSourceIds), now, now).run();
        newPages.push({ id, title: p.title });
        createdCount++;
        pageDebug[pageDebug.length-1].branch = 'insert';
      }
    } catch (e) { pageDebug[pageDebug.length-1].branch = 'ERROR'; pageDebug[pageDebug.length-1].error = e.message; console.error('[wiki] page save fail:', e.message, 'title=', p.title); await dblog(env, 'ingest', 'PAGE_ERROR', { title: p.title, error: e.message }); /* 跳过有问题的 page */ }
  }

  // links —— 只认 content 里真实存在的 [[双链]]，不认 AI 推断的（AI 推断可能不准）
  const linkPairs = new Set();
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

  // 双向补链：确保每条 (from→to) 的反向 (to→from) 也存在于 content 和 wiki_links
  // 收集所有页面最新的 content（本次更新的 + DB 已有的）
  const latestContents = new Map();
  for (const p of allPages) if (p.content) latestContents.set(p.title, p.content);
  const existingAll = await env.DB.prepare("SELECT title, content FROM wiki_pages WHERE kb_id=? AND (is_system=0 OR is_system IS NULL)")
    .bind(params.kb_id).all();
  for (const ep of existingAll.results) {
    if (!latestContents.has(ep.title)) latestContents.set(ep.title, ep.content || '');
  }

  {

    const backLinkRe = /\[\[([^\]]+)\]\]/g;
    for (const pair of linkPairs) {
      const [from, to] = pair.split('||');
      if (from === to) continue;
      let toContent = latestContents.get(to);
      if (!toContent) continue; // to 页面不存在，跳过

      // 检查 to 的 content 里有没有 [[from]]
      backLinkRe.lastIndex = 0;
      let hasBack = false, m;
      while ((m = backLinkRe.exec(toContent)) !== null) {
        if (m[1].trim() === from.trim()) { hasBack = true; break; }
      }

      if (!hasBack) {
        // 在 to 页面末尾追加 [[from]]，已有"关联页面"section 就追加进去，没有就新建
        const linkLine = `- [[${from}]]`;
        if (toContent.includes('## 关联页面')) {
          // 找到"关联页面"section，追加到它的列表里
          toContent = toContent.replace(/(## 关联页面\n(?:.+\n)*?)(?=\n## |\n# |\n*$)/, `$1${linkLine}\n`);
        } else {
          toContent = toContent.trimEnd() + `\n\n## 关联页面\n${linkLine}\n`;
        }
        latestContents.set(to, toContent);
        await env.DB.prepare("UPDATE wiki_pages SET content=?, updated_at=? WHERE kb_id=? AND title=?")
          .bind(toContent, now, params.kb_id, to).run();
        // 同时插入 wiki_links 反向边（确保图也是双向的）
        await env.DB.prepare("INSERT OR IGNORE INTO wiki_links (kb_id, user_id, from_title, to_title, relation, created_at) VALUES (?,?,?,?,?,?)")
          .bind(params.kb_id, user.uid, to, from, 'related', now).run();
      }
    }
  }

  // ===== 自检：孤立页面检测（content 里没有任何 [[xxx]]）=====
  const isolatedRe = /\[\[([^\]]+)\]\]/g;
  const allPageTitles = new Set((await env.DB.prepare("SELECT title FROM wiki_pages WHERE kb_id=? AND (is_system=0 OR is_system IS NULL)").bind(params.kb_id).all()).results.map(p => p.title));
  const warnings = [];
  for (const p of latestContents.entries()) {
    const [title, content] = p;
    if (title === '目录' || title === '日志') continue;
    // 只检查本次涉及的页面（allPages 里的），已有老页面暂不动
    const isRecent = allPages.some(ap => ap.title === title);
    if (!isRecent) continue;
    isolatedRe.lastIndex = 0;
    const hasAnyLink = isolatedRe.test(content || '');
    if (!hasAnyLink) {
      await dblog(env, 'ingest', 'ISOLATED', { title });
      warnings.push({ type: 'isolated', title });
      // 尝试补一个链接：找同分类里已有的第一个页面
      const catRow = await env.DB.prepare("SELECT category_id FROM wiki_pages WHERE kb_id=? AND title=?").bind(params.kb_id, title).first();
      if (catRow?.category_id) {
        const sib = await env.DB.prepare("SELECT title FROM wiki_pages WHERE kb_id=? AND category_id=? AND title!=? AND (is_system=0 OR is_system IS NULL) LIMIT 1")
          .bind(params.kb_id, catRow.category_id, title).first();
        if (sib) {
          const fixedContent = (content || '').trimEnd() + `\n\n## 关联页面\n- [[${sib.title}]]\n`;
          await env.DB.prepare("UPDATE wiki_pages SET content=?, updated_at=? WHERE kb_id=? AND title=?")
            .bind(fixedContent, now, params.kb_id, title).run();
          await env.DB.prepare("INSERT OR IGNORE INTO wiki_links (kb_id, user_id, from_title, to_title, relation, created_at) VALUES (?,?,?,?,?,?)")
            .bind(params.kb_id, user.uid, title, sib.title, 'related', now).run();
          warnings.push({ type: 'isolated_fixed', title, linkedTo: sib.title });
          await dblog(env, 'ingest', 'ISOLATED_FIXED', { title, linkedTo: sib.title });
        }
      }
    }
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
  else await env.DB.prepare("INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)")
    .bind(uuid(), params.kb_id, user.uid, null, catTitle, catalog, now, now).run();

  // 日志.md — 优先用 AI 返回的 log_entry，没有就硬编码拼
  const finalLog = allLogs.length > 0
    ? allLogs.join('\n') + '\n'
    : `[${new Date(now).toISOString().slice(0,10)}] 汇入资料｜${pending.length}份，新建${createdCount}页，更新${updatedCount}页\n`;
  const logTitle = '日志';
  const el = await env.DB.prepare("SELECT id, content FROM wiki_pages WHERE kb_id=? AND is_system=1 AND title=?").bind(params.kb_id, logTitle).first();
  if (el) await env.DB.prepare("UPDATE wiki_pages SET content=?, updated_at=? WHERE id=?").bind(el.content + finalLog, now, el.id).run();
  else await env.DB.prepare("INSERT INTO wiki_pages (id, kb_id, user_id, category_id, title, content, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)")
    .bind(uuid(), params.kb_id, user.uid, null, logTitle, '# 操作日志\n\n' + finalLog, now, now).run();

  // 标记已汇入 + 自动给 tags 追加 kb_id（支持一篇资料汇入多个 KB）
  // 只标记实际处理成功的 source（AI_FAIL 的 source 保留 ingested=0，下次还能重试）
  for (const s of pending) {
    if (!processedSourceIds.has(s.id)) { await dblog(env, 'ingest', 'SOURCE_SKIP', { id: s.id, reason: 'batch_fail' }); continue; }
    try {
      const row = await env.DB.prepare("SELECT tags FROM wiki_sources WHERE id=?").bind(s.id).first();
      let tags = [];
      try { tags = JSON.parse(row?.tags || '[]'); } catch { tags = []; }
      if (!Array.isArray(tags)) tags = [];
      if (!tags.includes(params.kb_id)) tags.push(params.kb_id);
      await env.DB.prepare("UPDATE wiki_sources SET ingested=1, ingested_at=?, tags=? WHERE id=?")
        .bind(now, JSON.stringify(tags), s.id).run();
    } catch (e) { console.error('[wiki] mark ingested fail:', e.message, 'source=', s.id); }
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

  await dblog(env, 'ingest', 'DONE', { ingested: processedSourceIds.size, totalPending: pending.length, created: createdCount, updated: updatedCount, links: linkPairs.size });

  // 更新 KB 的 updated_at（用于列表排序：最近活跃的排最上）
  await env.DB.prepare("UPDATE wiki_knowledge_bases SET updated_at = strftime('%s','now') WHERE id = ?").bind(params.kb_id).run();

  return json({
    ok: true,
    ingested_count: pending.length,
    created: createdCount,
    updated: updatedCount,
    links_added: linkPairs.size,
    pages: allPages.map(p => ({ title: p.title, category_slug: p.category_slug, summary: p.summary || '' })),
    debug: debugRaws,
    page_debug: pageDebug,
    warnings,
    slug_to_catid: slugToCatId
  });
}

// ====== Debug 日志接口（tail 连不上时的替代通路） ======
export async function handleWikiDebugLog(request, env) {
  const url = new URL(request.url);
  const clear = url.searchParams.get('clear');
  if (clear === '1') {
    try { await env.DB.prepare("DELETE FROM wiki_debug_log").run(); } catch {}
    return json({ ok: true, cleared: true });
  }
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const { results } = await env.DB.prepare(
    "SELECT ts, tag, msg, data FROM wiki_debug_log ORDER BY ts DESC LIMIT ?"
  ).bind(limit).all();
  return json({ logs: results.map(r => ({
    time: new Date(r.ts).toLocaleTimeString(),
    tag: r.tag, msg: r.msg,
    data: r.data ? (() => { try { return JSON.parse(r.data); } catch { return r.data; } })() : null
  })) });
}

// ====== 范本库 v5 — 全局化，kb_id 不再是必需参数 ======
// 旧路由 /api/wiki/kbs/:kb_id/templates 仍兼容（忽略 kb_id）
// 新路由 /api/wiki/templates 更干净
export async function handleWikiListTemplates(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { results: official } = await env.DB.prepare(
    "SELECT id, name, description, extract_hints, page_format, kind, builtin_key, category FROM wiki_templates WHERE user_id='system' AND kb_id IS NULL ORDER BY category, name"
  ).all();
  const { results: mine } = await env.DB.prepare(
    "SELECT id, name, description, extract_hints, page_format, kind, category FROM wiki_templates WHERE user_id=? AND kb_id IS NULL ORDER BY category, name"
  ).bind(user.uid).all();
  return json({ official, mine });
}

export async function handleWikiAddTemplate(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { name, description = '', extract_hints = '', page_format = '' } = await readBody(request);
  if (!name) return json({ error: "name required" }, 400);
  const now = Date.now();
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO wiki_templates (id, kb_id, user_id, name, description, extract_hints, page_format, kind, created_at, updated_at) VALUES (?,NULL,?,?,?,?,?,?,?,?)"
  ).bind(id, user.uid, name, description, extract_hints, page_format, 'user', now, now).run();
  return json({ id, name, ok: true }, 201);
}

export async function handleWikiDeleteTemplate(request, env, JWT_SECRET, params) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: "id required" }, 400);
  await env.DB.prepare("DELETE FROM wiki_templates WHERE id=? AND user_id=?")
    .bind(id, user.uid).run();
  return json({ ok: true });
}

export async function handleWikiBindTemplate(request, env, JWT_SECRET, params) {
  // 把范本的 extract_hints/page_format 复制到分类（不是引用！）
  // 范本现在全是全局的（官方 kb_id IS NULL，自建也 kb_id IS NULL）
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const { template_id, category_id } = body;
  if (!template_id || !category_id) return json({ error: "template_id and category_id required" }, 400);

  const tpl = await env.DB.prepare(
    "SELECT extract_hints, page_format FROM wiki_templates WHERE id=? AND (user_id='system' OR user_id=?)"
  ).bind(template_id, user.uid).first();
  if (!tpl) return json({ error: "template not found" }, 404);

  // category 仍属于某个 KB，kb_id 从 URL params 取（兼容旧路由）
  const kbId = params?.kb_id;
  if (!kbId) return json({ error: "kb_id required" }, 400);

  const now = Date.now();
  const info = await env.DB.prepare("UPDATE wiki_categories SET extract_hints=?, page_format=?, updated_at=? WHERE id=? AND kb_id=? AND user_id=?")
    .bind(tpl.extract_hints, tpl.page_format, now, category_id, kbId, user.uid).run();
  if (info.meta.changes === 0) return json({ error: "category not found" }, 404);

  return json({ ok: true });
}

// ============================================================
// 官方知识库预设（硬编码，避免 migration，方便快速迭代）
// seed 时按 template_key 从 wiki_templates 表拿到 extract_hints / page_format
// 全部用官方范本（kind=official, user_id='system'）
// ============================================================
const OFFICIAL_KB_PRESETS = [
  {
    slug: 'hongloumeng',
    title: '📚 红楼梦研究',
    description: '整理红楼人物、事件、地点，构建自己的红学研究库',
    icon: '📚',
    categories: [
      { name: '人物', slug: 'renwu', sort_order: 0, template_key: 'person' },
      { name: '事件', slug: 'shijian', sort_order: 1, template_key: 'event' },
      { name: '地点', slug: 'didian', sort_order: 2, template_key: 'place' },
      { name: '话题', slug: 'huati', sort_order: 3, template_key: 'topic' },
    ],
  },
  {
    slug: 'renwuzhi',
    title: '👤 我的人物志',
    description: '记录身边的家人、朋友、同事，整理他们的故事与联系',
    icon: '👤',
    categories: [
      { name: '家人', slug: 'jiaren', sort_order: 0, template_key: 'person' },
      { name: '朋友', slug: 'pengyou', sort_order: 1, template_key: 'person' },
      { name: '同事', slug: 'tongshi', sort_order: 2, template_key: 'person' },
      { name: '重要角色', slug: 'zhongyaojuese', sort_order: 3, template_key: 'person' },
    ],
  },
  {
    slug: 'dushu-guanying',
    title: '🎬 读书观影',
    description: '书籍、电影、剧集、游戏，整理看过的作品和感想',
    icon: '🎬',
    categories: [
      // 书籍
      { name: '书籍', slug: 'shuji', sort_order: 0, template_key: 'book' },
      { name: '书籍人物', slug: 'shuji-renwu', sort_order: 1, template_key: 'book_character' },
      // 电影
      { name: '电影', slug: 'dianying', sort_order: 10, template_key: 'film' },
      { name: '电影人物', slug: 'dianying-renwu', sort_order: 11, template_key: 'film_character' },
      { name: '经典场景', slug: 'jingdian-changjing', sort_order: 12, template_key: 'film_scene' },
      { name: '主题意象', slug: 'zhuti-yixiang', sort_order: 13, template_key: 'film_theme' },
      // 剧集/游戏
      { name: '剧集', slug: 'juji', sort_order: 20, template_key: 'tv_show' },
      { name: '游戏', slug: 'youxi', sort_order: 30, template_key: 'game' },
    ],
  },
  {
    active: false, // 暂停：跟日记板块冲突
    slug: 'riji-jinghua',
    title: '📔 日记精华',
    description: '从每天的日记中提炼精华，整理按日期、情绪、待办',
    icon: '📔',
    categories: [
      { name: '按日期', slug: 'anriqi', sort_order: 0, template_key: 'diary' },
      { name: '情绪', slug: 'qingxu', sort_order: 1, template_key: 'emotion' },
      { name: '待办计划', slug: 'daiban', sort_order: 2, template_key: 'topic' },
    ],
  },
  {
    active: false, slug: 'mubiao-chengzhang',
    title: '🎯 目标与成长',
    description: '年度目标、习惯养成、复盘回顾 — 笔记导向，暂停',
    icon: '🎯',
    categories: [
      { name: '年度目标', slug: 'niandu-mubiao', sort_order: 0, template_key: 'goal' },
      { name: '本季度目标', slug: 'jidu-mubiao', sort_order: 1, template_key: 'goal' },
      { name: '月度小目标', slug: 'yuedu-mubiao', sort_order: 2, template_key: 'goal' },
      { name: '习惯养成', slug: 'xiguan', sort_order: 10, template_key: 'habit' },
      { name: '情绪觉察', slug: 'qingxu', sort_order: 20, template_key: 'emotion' },
      { name: '成长话题', slug: 'huati', sort_order: 30, template_key: 'topic' },
    ],
  },
  {
    active: false, slug: 'linggan-shouji',
    title: '💡 灵感收集',
    description: '笔记导向，暂停',
    icon: '💡',
    categories: [
      { name: '摘抄金句', slug: 'zhaichao', sort_order: 0, template_key: 'inspiration' },
      { name: '灵感笔记', slug: 'linggan', sort_order: 1, template_key: 'inspiration' },
      { name: '待验证想法', slug: 'daiyanzheng', sort_order: 2, template_key: 'topic' },
      { name: '个人观点', slug: 'guandian', sort_order: 10, template_key: 'topic' },
    ],
  },
  {
    active: false, slug: 'lvxing-zj',
    title: '✈️ 旅行足迹',
    description: '笔记导向，暂停',
    icon: '✈️',
    categories: [
      { name: '旅行地', slug: 'lvxingdi', sort_order: 0, template_key: 'travel_place' },
      { name: '美食地图', slug: 'meishi', sort_order: 10, template_key: 'topic' },
      { name: '住宿体验', slug: 'zhusu', sort_order: 20, template_key: 'topic' },
    ],
  },
  {
    active: true,
    slug: 'boke-shipin',
    title: '🎙️ 播客与视频库',
    description: '小宇宙/苹果播客/B站/YouTube — 节目、单集、嘉宾、金句的结构化整理',
    icon: '🎙️',
    categories: [
      { name: '播客频道', slug: 'pindao', sort_order: 0, template_key: 'podcast' },
      { name: '单集笔记', slug: 'danji', sort_order: 1, template_key: 'episode' },
      { name: '嘉宾/UP主', slug: 'jiabin', sort_order: 10, template_key: 'person' },
      { name: '主题金句', slug: 'jinju', sort_order: 20, template_key: 'topic' },
    ],
  },
  {
    active: true,
    slug: 'meishi-caipu',
    title: '🍳 美食菜谱库',
    description: '菜谱、食材、烹饪技巧 — 把喜欢的菜系统化管理起来',
    icon: '🍳',
    categories: [
      { name: '菜谱', slug: 'caipu', sort_order: 0, template_key: 'recipe' },
      { name: '食材', slug: 'shicai', sort_order: 10, template_key: 'ingredient' },
      { name: '烹饪技巧', slug: 'jiqiao', sort_order: 20, template_key: 'topic' },
    ],
  },
  {
    active: true,
    slug: 'xuexi-biji',
    title: '🎓 学习笔记',
    description: '课程、概念定理、论文书单 — 构建自己的知识体系',
    icon: '🎓',
    categories: [
      { name: '课程', slug: 'kecheng', sort_order: 0, template_key: 'course' },
      { name: '概念定理', slug: 'gainian', sort_order: 10, template_key: 'concept' },
      { name: '论文/书单', slug: 'lunwen', sort_order: 20, template_key: 'book' },
      { name: '我的观点', slug: 'guandian', sort_order: 30, template_key: 'topic' },
    ],
  },
  {
    active: true,
    slug: 'jiankang-dangan',
    title: '💊 健康档案',
    description: '药品、症状、体检记录 — 把自己的健康知识库结构化管理',
    icon: '💊',
    categories: [
      { name: '药品档案', slug: 'yaopin', sort_order: 0, template_key: 'medicine' },
      { name: '症状记录', slug: 'zhengzhuang', sort_order: 10, template_key: 'symptom' },
      { name: '体检/检查', slug: 'tijian', sort_order: 20, template_key: 'health_record' },
    ],
  },
  {
    active: true,
    slug: 'xiaoxue-shuxue',
    title: '📐 小学数学解题知识库',
    description: '一年级到六年级，每道题按年级、知识点、解题方法三维整理，错题不再白错',
    icon: '📐',
    categories: [
      { name: '一年级', slug: 'yinianji',     sort_order: 0,  template_key: 'math_problem' },
      { name: '二年级', slug: 'ernianji',     sort_order: 10, template_key: 'math_problem' },
      { name: '三年级', slug: 'sannianji',     sort_order: 20, template_key: 'math_problem' },
      { name: '四年级', slug: 'sinianji',     sort_order: 30, template_key: 'math_problem' },
      { name: '五年级', slug: 'wunianji',     sort_order: 40, template_key: 'math_problem' },
      { name: '六年级', slug: 'liunianji',    sort_order: 50, template_key: 'math_problem' },
      { name: '知识点', slug: 'zhishidian',   sort_order: 90, template_key: 'math_concept' },
      { name: '解题方法', slug: 'jieti-fangfa', sort_order: 95, template_key: 'math_strategy' },
    ],
  },
];

// GET /api/wiki/official/presets — 列出所有官方预设
export async function handleWikiListOfficialPresets(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const publicList = OFFICIAL_KB_PRESETS.map(p => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    icon: p.icon,
    category_count: p.categories.length,
  }));
  return json({ presets: publicList });
}

// ===== 可复用：把一个官方预设 seed 给指定用户（幂等：slug 已存在就跳过）=====
async function seedOfficialPreset(env, userId, preset) {
  // 幂等检查：该用户是否已经有同 slug 的 KB
  const exist = await env.DB.prepare(
    "SELECT id FROM wiki_knowledge_bases WHERE user_id=? AND slug=?"
  ).bind(userId, preset.slug).first();
  if (exist) return { skipped: true, kb_id: exist.id };

  const now = Date.now();
  const kbId = uuid();

  await env.DB.prepare(
    "INSERT INTO wiki_knowledge_bases (id, user_id, slug, title, description, is_official, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(kbId, userId, preset.slug, preset.title, preset.description || '', 1, now, now).run();

  // 查所有用到的官方范本
  const tplKeys = [...new Set(preset.categories.map(c => c.template_key))];
  const tplRows = await env.DB.prepare(
    "SELECT builtin_key, extract_hints, page_format FROM wiki_templates WHERE builtin_key IN (" +
    tplKeys.map(() => '?').join(',') + ") AND user_id='system' AND kb_id IS NULL"
  ).bind(...tplKeys).all();
  const tplMap = {};
  for (const r of tplRows.results) tplMap[r.builtin_key] = r;

  // 创建每个分类
  for (const cat of preset.categories) {
    const tpl = tplMap[cat.template_key];
    if (!tpl) {
      console.warn(`[auto-seed] template ${cat.template_key} not found, skip cat ${cat.name}`);
      continue;
    }
    const catId = uuid();
    await env.DB.prepare(
      "INSERT INTO wiki_categories (id, kb_id, user_id, name, slug, sort_order, extract_hints, page_format, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).bind(catId, kbId, userId, cat.name, cat.slug, cat.sort_order, tpl.extract_hints, tpl.page_format, now, now).run();
  }
  return { skipped: false, kb_id: kbId };
}

// POST /api/wiki/official/seed — 手动 seed 指定预设
export async function handleWikiSeedOfficialPreset(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const slug = body.slug;
  if (!slug) return json({ error: "slug required" }, 400);
  const preset = OFFICIAL_KB_PRESETS.find(p => p.slug === slug);
  if (!preset) return json({ error: "preset not found" }, 404);

  const result = await seedOfficialPreset(env, user.uid, preset);
  if (result.skipped) return json({ ok: true, skipped: true, kb_id: result.kb_id, message: "已存在" });
  return json({ ok: true, kb_id: result.kb_id, title: preset.title });
}

// AI 总结标题（轻量，供前端"粘贴完文本后自动填标题"用）
export async function handleWikiSuggestTitle(request, env, JWT_SECRET) {
  const user = await auth(request, env, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await readBody(request);
  const text = (body.text || "").trim();
  if (!text) return json({ title: "" });

  // 只取前 800 字，够 AI 猜标题了，省 token
  const truncated = text.slice(0, 800);
  try {
    const raw = await wikiCallLLM(env, [
      { role: 'system', content: '你是标题总结器。根据用户给的文本，输出一个不超过20字的中文标题，准确、简洁，不要引号不要解释。只输出标题本身。' },
      { role: 'user', content: truncated }
    ], 60);
    let title = (raw || '').trim().replace(/^["'']|["'']$/g, '').replace(/\n/g, '').slice(0, 30);
    if (!title) title = truncated.slice(0, 20); // 兜底
    return json({ title });
  } catch (e) {
    // AI 失败不阻塞前端，返回兜底标题
    return json({ title: truncated.slice(0, 20) });
  }
}

export async function handleWikiCheckMatch(request, env, JWT_SECRET, params) {
  try {
    await dblog(env, 'check_match', 'START', { params, hasAuth: !!request.headers.get('Authorization') });
    const user = await auth(request, env, JWT_SECRET);
    if (!user) { await dblog(env, 'check_match', 'UNAUTH', {}); return json({ error: "unauthorized" }, 401); }
    const body = await readBody(request);
    const kbId = params.kbId;
    const text = (body.text || "").trim();
    if (!kbId || !text) return json({ match: "high" });

    const kb = await env.DB.prepare("SELECT title, description FROM wiki_knowledge_bases WHERE id=? AND user_id=?").bind(kbId, user.uid).first();
    if (!kb) return json({ match: "high" });
    await dblog(env, 'check_match', 'KB_FOUND', { title: kb.title, uid: user.uid });

    const truncated = text.slice(0, 600);
    try {
      const raw = await wikiCallLLM(env, [
        { role: 'system', content: '你是知识库主题匹配评估器。判断一段文本和一个知识库的主题是否相关。只回答 high / medium / low：high=强相关，medium=弱相关，low=不相关。' },
        { role: 'user', content: `知识库主题：${kb.title}${kb.description ? '（' + kb.description + '）' : ''}\n\n文本：${truncated}` }
      ], 10);
      const ans = (raw || '').trim().toLowerCase();
      await dblog(env, 'check_match', 'LLM_OK', { ans });
      if (ans.startsWith('high')) return json({ match: 'high' });
      if (ans.startsWith('medium')) return json({ match: 'medium' });
      return json({ match: 'low' });
    } catch (e) {
      await dblog(env, 'check_match', 'LLM_ERR', { msg: e?.message, stack: e?.stack?.slice(0, 300) });
      return json({ match: 'high' });
    }
  } catch (e) {
    await dblog(env, 'check_match', 'FATAL', { msg: e?.message, stack: e?.stack?.slice(0, 500) });
    throw e; // 让 index.js 的 catch 打 500
  }
}
