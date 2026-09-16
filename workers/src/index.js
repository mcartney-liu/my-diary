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
 */
import { hashPassword, verifyPassword, genSalt, signJWT, verifyJWT, authUser } from "./auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { headers: CORS });
    }

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
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
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
