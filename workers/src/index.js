/**
 * MyDiary API — Cloudflare Worker
 * Routes:
 *   POST   /api/auth/register    注册
 *   POST   /api/auth/login       登录
 *   GET    /api/auth/me          当前用户信息
 *   GET    /api/diaries          拉全部日记（或 ?from=YYYY-MM-DD&to=YYYY-MM-DD）
 *   POST   /api/diaries          创建/更新一篇日记（upsert by user_id + date）
 *   DELETE /api/diaries/:id      删除一篇日记
 *   GET    /api/profile          个人资料
 *   PATCH  /api/profile          更新个人资料
 *   POST   /api/feedback         提交反馈（需登录）
 *   GET    /api/admin/feedbacks  查看所有反馈（管理员 key）
 *   POST   /api/templates        保存自定义模板
 *   GET    /api/templates        我的模板列表
 *   DELETE /api/templates        删除模板
 *   PATCH  /api/templates        更新模板
 *   POST   /api/milestones       保存纪念日
 *   GET    /api/milestones        我的纪念日列表
 *   DELETE /api/milestones        删除纪念日
 *   PATCH  /api/milestones        更新纪念日
 */
import { hashPassword, verifyPassword, genSalt, signJWT, verifyJWT, authUser } from "./auth.js";

const ALLOWED_ORIGINS = [
  "https://mydiary-web.pages.dev",
  /\.mydiary-web\.pages\.dev$/,  // 允许所有 prod hash 快照域名
  "https://mydiary-web-dev.pages.dev",
  /\.mydiary-web-dev\.pages\.dev$/,  // 允许所有 dev hash 快照域名
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5180",
  "http://localhost:5181",
  "http://localhost:5182",
];

function buildCors(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some(o =>
    typeof o === "string" ? o === origin : o.test(origin)
  ) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",  // iOS Safari: 缓存 preflight 24h
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { headers: buildCors(request) });
    }
    globalThis._curReq = request;  // 让 json() 能拿到 request

    const url = new URL(request.url);
    const path = url.pathname;
    const JWT_SECRET = env.JWT_SECRET || "dev-secret-change-me";

    // 路由表（method + path → handler）
    const routes = [
      ["POST",   "/api/auth/register",  handleRegister],
      ["POST",   "/api/auth/login",     handleLogin],
      ["GET",    "/api/auth/me",        handleMe],
      ["GET",    "/api/diaries",        handleListDiaries],
      ["POST",   "/api/diaries",        handleSaveDiary],
      ["DELETE", "/api/diaries",        handleDeleteDiary],
      ["GET",    "/api/profile",        handleGetProfile],
      ["PATCH",  "/api/profile",        handlePatchProfile],
      ["POST",   "/api/feedback",       handleSubmitFeedback],
      ["GET",    "/api/admin/feedbacks", handleListFeedbacks],
      ["POST",   "/api/templates",      handleSaveTemplate],
      ["GET",    "/api/templates",       handleListTemplates],
      ["DELETE", "/api/templates",       handleDeleteTemplate],
      ["PATCH",  "/api/templates",       handleUpdateTemplate],
      ["PATCH",  "/api/templates/share", handleShareTemplate],
      ["POST",   "/api/papers",          handleSavePaper],
      ["GET",    "/api/papers",          handleListPapers],
      ["DELETE", "/api/papers",          handleDeletePaper],
      ["PATCH",  "/api/papers/share",    handleSharePaper],
      ["POST",   "/api/milestones",      handleSaveMilestone],
      ["GET",    "/api/milestones",      handleListMilestones],
      ["DELETE", "/api/milestones",      handleDeleteMilestone],
      ["PATCH",  "/api/milestones",      handleUpdateMilestone],
    ];

    for (const [method, p, handler] of routes) {
      if (request.method === method && path === p) {
        try {
          return await handler(request, env, JWT_SECRET);
        } catch (e) {
          return json({ error: e.message || "internal error" }, 500);
        }
      }
    }

    return json({ error: "not found" }, 404);
  },
};

// ====== helpers ======
function json(obj, status = 200) {
  const cors = buildCors(globalThis._curReq || { headers: { get: () => null } });
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
function uuid() {
  return crypto.randomUUID();
}
async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

// ====== Auth ======
async function handleRegister(request, env, JWT_SECRET) {
  const { email, password, nickname } = await readBody(request);
  if (!email || !password || password.length < 6) return json({ error: "email and password(≥6) required" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "email already registered" }, 409);

  const salt = genSalt();
  const pwHash = await hashPassword(password, salt);
  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, email, `${salt}$${pwHash}`, nickname || "", now, now).run();

  await env.DB.prepare(
    "INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)"
  ).bind(id, now).run();

  const token = await signJWT({ uid: id, email }, JWT_SECRET);
  return json({ token, user: { id, email, nickname: nickname || "" } }, 201);
}

async function handleLogin(request, env, JWT_SECRET) {
  const { email, password } = await readBody(request);
  if (!email || !password) return json({ error: "email and password required" }, 400);

  const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!row) return json({ error: "invalid credentials" }, 401);

  const [salt, storedHash] = row.password_hash.split("$");
  const ok = await verifyPassword(password, storedHash, salt);
  if (!ok) return json({ error: "invalid credentials" }, 401);

  const token = await signJWT({ uid: row.id, email: row.email }, JWT_SECRET);
  return json({ token, user: { id: row.id, email: row.email, nickname: row.nickname } });
}

async function handleMe(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);
  const row = await env.DB.prepare("SELECT id, email, nickname, avatar FROM users WHERE id = ?").bind(user.uid).first();
  return json({ user: row });
}

// ====== Diaries ======
async function handleListDiaries(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const from = q.get("from");   // YYYY-MM-DD
  const to = q.get("to");
  const limit = parseInt(q.get("limit") || "100");

  let sql = "SELECT * FROM diaries WHERE user_id = ?";
  const binds = [user.uid];
  if (from) { sql += " AND date >= ?"; binds.push(from); }
  if (to)   { sql += " AND date <= ?"; binds.push(to); }
  sql += " ORDER BY date DESC LIMIT ?";
  binds.push(Math.min(limit, 365));

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  const out = rows.results.map(r => ({
    ...r,
    blocks: JSON.parse(r.blocks || "[]"),
    tags: JSON.parse(r.tags || "[]"),
  }));
  return json({ diaries: out });
}

async function handleSaveDiary(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id, date, template_id, title, mood_id, tags, weather, blocks } = body;
  if (!date) return json({ error: "date required" }, 400);

  const now = Date.now();
  const blocksJson = JSON.stringify(blocks || []);
  const tagsJson = JSON.stringify(tags || []);

  // Upsert by user_id + date (唯一约束)
  const existing = id
    ? await env.DB.prepare("SELECT id FROM diaries WHERE id = ? AND user_id = ?").bind(id, user.uid).first()
    : await env.DB.prepare("SELECT id FROM diaries WHERE user_id = ? AND date = ?").bind(user.uid, date).first();

  let diaryId = existing?.id;
  if (existing) {
    await env.DB.prepare(
      `UPDATE diaries SET date=?, template_id=?, title=?, mood_id=?, tags=?, weather=?, blocks=?, updated_at=?
       WHERE id=? AND user_id=?`
    ).bind(date, template_id || "diary", title || "", mood_id || "calm", tagsJson,
           weather ? JSON.stringify(weather) : null, blocksJson, now, existing.id, user.uid).run();
  } else {
    diaryId = uuid();
    await env.DB.prepare(
      `INSERT INTO diaries (id, user_id, date, template_id, title, mood_id, tags, weather, blocks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(diaryId, user.uid, date, template_id || "diary", title || "", mood_id || "calm",
           tagsJson, weather ? JSON.stringify(weather) : null, blocksJson, now, now).run();
  }

  return json({ id: diaryId, ok: true });
}

async function handleDeleteDiary(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM diaries WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

// ====== Profile ======
async function handleGetProfile(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const u = await env.DB.prepare("SELECT id, email, nickname, avatar FROM users WHERE id = ?").bind(user.uid).first();
  const p = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(user.uid).first();
  const countRow = await env.DB.prepare("SELECT COUNT(*) as c FROM diaries WHERE user_id = ?").bind(user.uid).first();

  // 统计总字数（应用层，D1 不支持 json_length）
  const allBlocks = await env.DB.prepare("SELECT blocks FROM diaries WHERE user_id = ?").bind(user.uid).all();
  let totalWords = 0;
  for (const row of allBlocks.results) {
    try {
      const blocks = JSON.parse(row.blocks || "[]");
      for (const b of blocks) {
        if (b.kind === "text" && b.content) totalWords += b.content.length;
      }
    } catch {}
  }

  return json({
    user: u,
    profile: p,
    stats: {
      total_diaries: countRow?.c || 0,
      streak_days: p?.streak_days || 0,
      total_words: totalWords,
    },
  });
}

async function handlePatchProfile(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const now = Date.now();

  // 更新 profiles 表
  const allowedProfile = ["bio", "theme", "default_mood", "daily_goal"];
  const patches = allowedProfile.filter(k => body[k] !== undefined).map(k => `${k} = ?`);
  if (patches.length) {
    const values = allowedProfile.filter(k => body[k] !== undefined).map(k => body[k]);
    values.push(now, user.uid);
    await env.DB.prepare(`UPDATE profiles SET ${patches.join(", ")}, updated_at = ? WHERE user_id = ?`).bind(...values).run();
  }

  // 更新 users 表（nickname/avatar）
  const allowedUser = ["nickname", "avatar"];
  const uPatches = allowedUser.filter(k => body[k] !== undefined).map(k => `${k} = ?`);
  if (uPatches.length) {
    const uValues = allowedUser.filter(k => body[k] !== undefined).map(k => body[k]);
    uValues.push(now, user.uid);
    await env.DB.prepare(`UPDATE users SET ${uPatches.join(", ")}, updated_at = ? WHERE id = ?`).bind(...uValues).run();
  }

  return json({ ok: true });
}

// ====== Feedback ======
async function handleSubmitFeedback(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { type = "suggestion", title = "", content, app_version = "0.1.0", device = "" } = body;
  if (!content || !content.trim()) return json({ error: "content required" }, 400);
  if (content.length > 2000) return json({ error: "content too long (max 2000 chars)" }, 400);

  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO feedbacks (id, user_id, type, title, content, app_version, device, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.uid, type, title, content.trim(), app_version, device, now).run();

  return json({ id, ok: true });
}

async function handleListFeedbacks(request, env) {
  const q = new URL(request.url).searchParams;
  const key = q.get("key") || request.headers.get("X-Admin-Key");
  const ADMIN_KEY = env.ADMIN_KEY || "dev-admin";
  if (key !== ADMIN_KEY) return json({ error: "forbidden" }, 403);

  const limit = Math.min(parseInt(q.get("limit") || "50"), 200);
  const rows = await env.DB.prepare(
    `SELECT f.*, u.email, u.nickname FROM feedbacks f
     JOIN users u ON f.user_id = u.id
     ORDER BY f.created_at DESC LIMIT ?`
  ).bind(limit).all();

  return json({ feedbacks: rows.results });
}

// ====== Templates ======
async function handleSaveTemplate(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { name, icon = "📋", description = "", blocks = [], default_title = "", default_tags = [], wallpaper = "", show_lines = 1, default_mood_id = "" } = body;
  if (!name || !name.trim()) return json({ error: "name required" }, 400);
  if (!blocks.length) return json({ error: "blocks required" }, 400);

  // 拿 author_name
  const u = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(user.uid).first();
  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO templates (id, user_id, name, icon, description, blocks, default_title, default_tags, wallpaper, show_lines, default_mood_id, is_public, author_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(id, user.uid, name.trim(), icon, description,
     JSON.stringify(blocks), default_title, JSON.stringify(default_tags),
     wallpaper, show_lines ? 1 : 0, default_mood_id,
     u?.nickname || user.uid.slice(0, 8), now, now).run();

  return json({ id, ok: true });
}

async function handleListTemplates(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const scope = q.get("scope") || "mine"; // mine | public | all

  let rows;
  if (scope === "mine") {
    rows = await env.DB.prepare(
      "SELECT * FROM templates WHERE user_id = ? ORDER BY updated_at DESC"
    ).bind(user.uid).all();
  } else if (scope === "public") {
    rows = await env.DB.prepare(
      "SELECT * FROM templates WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 100"
    ).all();
  } else {
    rows = await env.DB.prepare(
      "SELECT * FROM templates WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC LIMIT 100"
    ).bind(user.uid).all();
  }

  const out = rows.results.map(r => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    description: r.description,
    blocks: JSON.parse(r.blocks || "[]"),
    default_title: r.default_title,
    default_tags: JSON.parse(r.default_tags || "[]"),
    wallpaper: r.wallpaper,
    show_lines: r.show_lines === 1,
    default_mood_id: r.default_mood_id,
    is_public: r.is_public === 1,
    author_id: r.user_id,
    author_name: r.author_name || "",
    is_owner: r.user_id === user.uid,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return json({ templates: out });
}

async function handleDeleteTemplate(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

async function handleUpdateTemplate(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id } = body;
  if (!id) return json({ error: "id required" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM templates WHERE id = ? AND user_id = ?").bind(id, user.uid).first();
  if (!existing) return json({ error: "not found" }, 404);

  const now = Date.now();
  const fields = [];
  const values = [];
  const allowed = ["name", "icon", "description", "blocks", "default_title", "default_tags", "wallpaper", "show_lines", "default_mood_id"];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (key === "blocks" || key === "default_tags") {
        values.push(JSON.stringify(body[key]));
      } else if (key === "show_lines") {
        values.push(body[key] ? 1 : 0);
      } else {
        values.push(body[key]);
      }
    }
  }
  if (!fields.length) return json({ ok: true });

  fields.push("updated_at = ?");
  values.push(now, id, user.uid);

  await env.DB.prepare(`UPDATE templates SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return json({ ok: true });
}

async function handleShareTemplate(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id, is_public } = body;
  if (!id) return json({ error: "id required" }, 400);

  const u = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(user.uid).first();
  const now = Date.now();

  await env.DB.prepare(
    "UPDATE templates SET is_public = ?, author_name = COALESCE(author_name, ?), updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(is_public ? 1 : 0, u?.nickname || "", now, id, user.uid).run();

  return json({ ok: true });
}

// ====== Papers (信纸库) ======
async function handleSavePaper(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { name, description = "", image_data, thumbnail = "", show_lines = 1 } = body;
  if (!name || !name.trim()) return json({ error: "name required" }, 400);
  if (!image_data) return json({ error: "image_data required" }, 400);

  const u = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(user.uid).first();
  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO papers (id, user_id, name, description, image_data, thumbnail, show_lines, is_public, author_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(id, user.uid, name.trim(), description, image_data, thumbnail,
     show_lines ? 1 : 0, u?.nickname || user.uid.slice(0, 8), now, now).run();

  return json({ id, ok: true });
}

async function handleListPapers(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const scope = q.get("scope") || "mine";

  let rows;
  if (scope === "mine") {
    rows = await env.DB.prepare(
      "SELECT * FROM papers WHERE user_id = ? ORDER BY updated_at DESC"
    ).bind(user.uid).all();
  } else if (scope === "public") {
    rows = await env.DB.prepare(
      "SELECT * FROM papers WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 100"
    ).all();
  } else {
    rows = await env.DB.prepare(
      "SELECT * FROM papers WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC LIMIT 100"
    ).bind(user.uid).all();
  }

  const out = rows.results.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image_data: r.image_data,
    thumbnail: r.thumbnail,
    show_lines: r.show_lines === 1,
    is_public: r.is_public === 1,
    author_id: r.user_id,
    author_name: r.author_name || "",
    is_owner: r.user_id === user.uid,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return json({ papers: out });
}

async function handleDeletePaper(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM papers WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

async function handleSharePaper(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id, is_public } = body;
  if (!id) return json({ error: "id required" }, 400);

  const u = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(user.uid).first();
  const now = Date.now();

  await env.DB.prepare(
    "UPDATE papers SET is_public = ?, author_name = COALESCE(author_name, ?), updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(is_public ? 1 : 0, u?.nickname || "", now, id, user.uid).run();

  return json({ ok: true });
}

// ====== Milestones (纪念日) ======
async function handleSaveMilestone(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { type, target_mm, target_dd, start_date, target_date, icon = "🎯", title, description = "", diary_id, auto_created = 0 } = body;
  if (!title || !title.trim()) return json({ error: "title required" }, 400);
  if (!["fixed", "start", "countdown"].includes(type)) return json({ error: "type must be fixed|start|countdown" }, 400);

  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO milestones (id, user_id, type, target_mm, target_dd, start_date, target_date, icon, title, description, diary_id, auto_created, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.uid, type,
     target_mm ?? null, target_dd ?? null, start_date ?? null, target_date ?? null,
     icon, title.trim(), description, diary_id || null, auto_created ? 1 : 0, now, now).run();

  return json({ id, ok: true });
}

async function handleListMilestones(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const rows = await env.DB.prepare(
    "SELECT * FROM milestones WHERE user_id = ? ORDER BY updated_at DESC"
  ).bind(user.uid).all();

  const out = rows.results.map(r => ({
    id: r.id,
    type: r.type,
    target_mm: r.target_mm,
    target_dd: r.target_dd,
    start_date: r.start_date,
    target_date: r.target_date,
    icon: r.icon,
    title: r.title,
    description: r.description,
    diary_id: r.diary_id,
    auto_created: r.auto_created === 1,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return json({ milestones: out });
}

async function handleDeleteMilestone(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM milestones WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

async function handleUpdateMilestone(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id } = body;
  if (!id) return json({ error: "id required" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM milestones WHERE id = ? AND user_id = ?").bind(id, user.uid).first();
  if (!existing) return json({ error: "not found" }, 404);

  const now = Date.now();
  const fields = [];
  const values = [];
  const allowed = ["type", "target_mm", "target_dd", "start_date", "target_date", "icon", "title", "description", "diary_id"];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (!fields.length) return json({ ok: true });

  fields.push("updated_at = ?");
  values.push(now, id, user.uid);

  await env.DB.prepare(`UPDATE milestones SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return json({ ok: true });
}

