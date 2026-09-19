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
      ["POST",   "/api/plans",           handleSavePlan],
      ["GET",    "/api/plans",           handleListPlans],
      ["DELETE", "/api/plans",           handleDeletePlan],
      ["PATCH",  "/api/plans",           handleUpdatePlan],
      ["POST",   "/api/summaries",       handleSaveSummary],
      ["GET",    "/api/summaries",       handleListSummaries],
      ["POST",   "/api/ai/ask",          handleAsk],
      ["POST",   "/api/ai/reindex",      handleReindex],
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
  try {
    const user = await authUser(request, JWT_SECRET);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await readBody(request);
    const { id, date, template_id, title, mood_id, tags, weather, blocks,
            milestone_info, plan_info, deleted_at, capsule_unlock_at, wallpaper, show_lines } = body;
    if (!date) return json({ error: "date required" }, 400);

    const now = Date.now();
    const blocksJson = JSON.stringify(blocks || []);
    const tagsJson = JSON.stringify(tags || []);
    let tplId = template_id || "diary";
    console.log("[handleSaveDiary] 📥 template_id:", tplId, "milestone_info:", milestone_info ? JSON.stringify(milestone_info) : "(无)");

    // Upsert 策略（防重复核心）：
    // 1. 优先按前端传的 id 查 → 编辑已有日记
    // 2. 没找到 OR 前端没传 id →
    //    - finance/milestone/plan 模板 → 查同 date + 同 template_id + 同 title
    //      （用户点两次"保存"同一笔 → UPDATE 旧的，不 INSERT 新的）
    //    - 其它模板 → 查同 user_id + date
    // 说明：migration 0005 已经去掉了 diaries 表的 UNIQUE(user_id, date) 约束，
    // 所以 finance/milestone/plan 允许多篇/天，但"同标题同日期"应该合并。
    // time_capsule 特殊处理：按 capsule_unlock_at（解锁日期）作为语义唯一键
    const isCapsule = tplId === "time_capsule";
    // milestone/plan/finance → 同日期+同模板+同标题合并；time_capsule → 同日期+同解锁日合并；其它 → 同 user+date 合并
    const multiPerDay = isCapsule || tplId === "milestone" || tplId === "plan" || tplId === "finance";

    // 分支 1：按 id 查（编辑）
    if (id) {
      existing = await env.DB.prepare("SELECT id FROM diaries WHERE id = ? AND user_id = ?").bind(id, user.uid).first();
    }

    // 分支 2：没找到 OR 没传 id → 按语义唯一键查
    // 🔑 关键：不管前端有没有传新 uid，同 title + 同 date + 同 template → UPDATE
    if (!existing) {
      const normalizedTitle = (title || "").trim();
      if (isCapsule && capsule_unlock_at) {
        // time_capsule：同 user + 同 date + 同解锁日期 → UPDATE；不同解锁日期 → INSERT 新胶囊
        existing = await env.DB.prepare(
          "SELECT id FROM diaries WHERE user_id = ? AND date = ? AND template_id = ? AND capsule_unlock_at = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1"
        ).bind(user.uid, date, tplId, capsule_unlock_at).first();
      } else if (multiPerDay && normalizedTitle) {
        // finance/milestone/plan：同日期 + 同模板 + 同标题 → UPDATE
        existing = await env.DB.prepare(
          "SELECT id FROM diaries WHERE user_id = ? AND date = ? AND template_id = ? AND title = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1"
        ).bind(user.uid, date, tplId, normalizedTitle).first();
      } else if (!multiPerDay) {
        // 普通模板：同 user + date → UPDATE（每天一篇）
        existing = await env.DB.prepare(
          "SELECT id FROM diaries WHERE user_id = ? AND date = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1"
        ).bind(user.uid, date).first();
      }
      // multiPerDay 且 title/capsule_unlock_at 空 → 确实是新的一篇 → 不设 existing，走 INSERT
    }

    let diaryId = existing?.id;
    if (existing) {
      await env.DB.prepare(
        `UPDATE diaries SET date=?, template_id=?, title=?, mood_id=?, tags=?, weather=?, blocks=?,
          deleted_at=?, capsule_unlock_at=?, wallpaper=?, show_lines=?, updated_at=?
         WHERE id=? AND user_id=?`
      ).bind(date, tplId, title || "", mood_id || "calm", tagsJson,
             weather ? JSON.stringify(weather) : null, blocksJson,
             deleted_at ?? null, capsule_unlock_at ?? null, wallpaper ?? null, show_lines ?? 1,
             now, existing.id, user.uid).run();
      console.log("[handleSaveDiary] 📝 UPDATE diary:", diaryId);
    } else {
      diaryId = uuid();
      await env.DB.prepare(
        `INSERT INTO diaries (id, user_id, date, template_id, title, mood_id, tags, weather, blocks,
          deleted_at, capsule_unlock_at, wallpaper, show_lines, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(diaryId, user.uid, date, tplId, title || "", mood_id || "calm",
             tagsJson, weather ? JSON.stringify(weather) : null, blocksJson,
             deleted_at ?? null, capsule_unlock_at ?? null, wallpaper ?? null, show_lines ?? 1,
             now, now).run();
      console.log("[handleSaveDiary] ✨ INSERT diary:", diaryId);
    }

    // ⭐ milestone 自动双写到子表（降级处理：失败不阻塞日记保存）
    const needMilestoneDualWrite = milestone_info && milestone_info.type;
    if (needMilestoneDualWrite) {
      try {
        console.log("[handleSaveDiary] 🎯 milestone 双写开始, diaryId:", diaryId, "type:", milestone_info.type);
        // 确保 diary template_id 是 milestone
        if (tplId !== "milestone") {
          await env.DB.prepare("UPDATE diaries SET template_id = ? WHERE id = ? AND user_id = ?").bind("milestone", diaryId, user.uid).run();
          tplId = "milestone";
        }
        // 查已存在（同一 diary_id）
        const existingM = await env.DB.prepare("SELECT id FROM milestones WHERE diary_id = ?").bind(diaryId).first();
        const mIcon = milestone_info.icon || "🎯";
        const mTitle = milestone_info.title || title || "纪念日";
        const mDesc = milestone_info.description || "";

        if (existingM) {
          await env.DB.prepare(
            `UPDATE milestones SET target_mm=?, target_dd=?, start_date=?, target_date=?, icon=?, title=?, description=?, diary_id=?, updated_at=?
             WHERE id=? AND user_id=?`
          ).bind(
            milestone_info.target_mm || null, milestone_info.target_dd || null,
            milestone_info.start_date || null, milestone_info.target_date || null,
            mIcon, mTitle, mDesc, diaryId, now, existingM.id, user.uid
          ).run();
          console.log("[handleSaveDiary] ✏️ UPDATE milestone:", existingM.id, "→", mTitle);
        } else {
          const mId = uuid();
          await env.DB.prepare(
            `INSERT INTO milestones (id, user_id, type, target_mm, target_dd, start_date, target_date, icon, title, description, diary_id, auto_created, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
          ).bind(
            mId, user.uid, milestone_info.type,
            milestone_info.target_mm || null, milestone_info.target_dd || null,
            milestone_info.start_date || null, milestone_info.target_date || null,
            mIcon, mTitle, mDesc, diaryId, now, now
          ).run();
          console.log("[handleSaveDiary] ✨ INSERT milestone:", mId, "→", mTitle);
        }
      } catch (me) {
        console.error("[handleSaveDiary] ⚠️ milestone 双写失败（不影响日记）:", me.message);
      }
    }

    // ⭐ plan 自动双写到子表（降级处理：失败不阻塞日记保存）
    const needPlanDualWrite = plan_info && (plan_info.target_date || plan_info.title);
    if (needPlanDualWrite) {
      try {
        console.log("[handleSaveDiary] 🎯 plan 双写开始, diaryId:", diaryId);
        if (tplId !== "plan") {
          await env.DB.prepare("UPDATE diaries SET template_id = ? WHERE id = ? AND user_id = ?").bind("plan", diaryId, user.uid).run();
          tplId = "plan";
        }
        const existingP = await env.DB.prepare("SELECT id FROM plans WHERE diary_id = ?").bind(diaryId).first();
        const pIcon = plan_info.icon || "🎯";
        const pTitle = plan_info.title || title || "计划";
        const pDesc = plan_info.description || "";
        const pStatus = plan_info.status || "pending";

        if (existingP) {
          await env.DB.prepare(
            `UPDATE plans SET target_date=?, status=?, icon=?, title=?, description=?, diary_id=?, updated_at=?
             WHERE id=? AND user_id=?`
          ).bind(
            plan_info.target_date || null, pStatus, pIcon, pTitle, pDesc, diaryId, now, existingP.id, user.uid
          ).run();
          console.log("[handleSaveDiary] ✏️ UPDATE plan:", existingP.id, "→", pTitle);
        } else {
          const pId = uuid();
          await env.DB.prepare(
            `INSERT INTO plans (id, user_id, target_date, status, icon, title, description, diary_id, auto_created, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
          ).bind(
            pId, user.uid, plan_info.target_date || null, pStatus, pIcon, pTitle, pDesc, diaryId, now, now
          ).run();
          console.log("[handleSaveDiary] ✨ INSERT plan:", pId, "→", pTitle, "target_date:", plan_info.target_date);
        }
      } catch (pe) {
        console.error("[handleSaveDiary] ⚠️ plan 双写失败（不影响日记）:", pe.message);
      }
    }

    // 异步 embedding（不阻塞主流程）
    embedDiaryInBackground(env, diaryId, user.uid, body);

    return json({ id: diaryId, ok: true });
  } catch (e) {
    console.error("[handleSaveDiary] ❌ 主流程异常:", e.message, e.stack);
    return json({ error: "save_failed", detail: e.message }, 500);
  }
}

async function handleDeleteDiary(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  const force = q.get("force") === "1";  // 前端确认"真的硬删"才传

  if (!id) return json({ error: "id required" }, 400);

  if (force) {
    // 硬删（回收站清空 / 永久删除）
    await env.DB.prepare("DELETE FROM diaries WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  } else {
    // 默认软删（设 deleted_at，拉列表时前端自己过滤）
    await env.DB.prepare("UPDATE diaries SET deleted_at = ? WHERE id = ? AND user_id = ?").bind(Date.now(), id, user.uid).run();
  }
  return json({ ok: true });
}

// ====== Profile ======
async function handleGetProfile(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const u = await env.DB.prepare("SELECT id, email, nickname, avatar FROM users WHERE id = ?").bind(user.uid).first();
  const p = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(user.uid).first();
  const countRow = await env.DB.prepare("SELECT COUNT(*) as c FROM diaries WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')").bind(user.uid).first();

  // 统计总字数（应用层，D1 不支持 json_length）
  const allBlocks = await env.DB.prepare("SELECT blocks FROM diaries WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')").bind(user.uid).all();
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
  const { name, icon = "📋", description = "", blocks = [], default_title = "", default_tags = [], wallpaper = "", show_lines = 1, default_mood_id = "", keywords = "" } = body;
  if (!name || !name.trim()) return json({ error: "name required" }, 400);
  if (!blocks.length) return json({ error: "blocks required" }, 400);

  const u = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(user.uid).first();
  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO templates (id, user_id, name, icon, description, keywords, blocks, default_title, default_tags, wallpaper, show_lines, default_mood_id, is_public, author_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(id, user.uid, name.trim(), icon, description, keywords,
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
    keywords: r.keywords || "",
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
  const allowed = ["name", "icon", "description", "keywords", "blocks", "default_title", "default_tags", "wallpaper", "show_lines", "default_mood_id"];
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



// ====== Plans (计划) ======
async function handleSavePlan(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { target_date, icon = "🎯", title, description = "", diary_id, auto_created = 0, status = "pending" } = body;
  if (!title || !title.trim()) return json({ error: "title required" }, 400);

  const now = Date.now();
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO plans (id, user_id, target_date, status, icon, title, description, diary_id, auto_created, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.uid, target_date || null, status, icon, title.trim(), description, diary_id || null, auto_created ? 1 : 0, now, now).run();

  return json({ id, ok: true });
}

async function handleListPlans(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const rows = await env.DB.prepare(
    "SELECT * FROM plans WHERE user_id = ? ORDER BY target_date ASC, updated_at DESC"
  ).bind(user.uid).all();

  const today = new Date().toISOString().slice(0, 10);
  const out = rows.results.map(r => ({
    id: r.id,
    target_date: r.target_date,
    status: r.status,
    icon: r.icon,
    title: r.title,
    description: r.description,
    diary_id: r.diary_id,
    auto_created: r.auto_created === 1,
    created_at: r.created_at,
    updated_at: r.updated_at,
    // 前端算状态时用
    days_until: r.target_date ? Math.ceil((new Date(r.target_date) - new Date(today)) / 86400000) : null,
  }));

  return json({ plans: out });
}

async function handleDeletePlan(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM plans WHERE id = ? AND user_id = ?").bind(id, user.uid).run();
  return json({ ok: true });
}

async function handleUpdatePlan(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await readBody(request);
  const { id } = body;
  if (!id) return json({ error: "id required" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM plans WHERE id = ? AND user_id = ?").bind(id, user.uid).first();
  if (!existing) return json({ error: "not found" }, 404);

  const now = Date.now();
  const fields = [];
  const values = [];
  const allowed = ["target_date", "status", "icon", "title", "description", "diary_id"];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (!fields.length) return json({ ok: true });

  fields.push("updated_at = ?");
  values.push(now, id, user.uid);

  await env.DB.prepare(`UPDATE plans SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return json({ ok: true });
}
// ====== Daily Summaries (每日 AI 总结) ======
async function handleSaveSummary(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await readBody(request);
  const { date, summary, diary_count = 0 } = body;
  if (!date || !summary) return json({ error: 'date and summary required' }, 400);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO daily_summaries (user_id, date, summary, diary_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(user.uid, date, summary, diary_count, now, now).run();

  return json({ ok: true });
}

async function handleListSummaries(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    'SELECT * FROM daily_summaries WHERE user_id = ? ORDER BY date DESC'
  ).bind(user.uid).all();

  return json({ summaries: rows.results });
}
// ======= AI 知识库问答模块 =======

function extractDiaryText(diary) {
  if (!diary) return '';
  const parts = [];
  if (diary.title) parts.push(diary.title);
  try {
    const blocks = typeof diary.body === 'string' ? JSON.parse(diary.body) : diary.body;
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b?.type === 'text' && b.text) parts.push(b.text);
        if (b?.type === 'paragraph' && b.text) parts.push(b.text);
      }
    }
  } catch {}
  return parts.join('\n').trim();
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function float32ToJson(arr) { return JSON.stringify(Array.from(arr)); }
function jsonToFloat32(text) { return new Float32Array(JSON.parse(text)); }

const EMBEDDING_MODEL = '@cf/baai/bge-m3';
const LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

async function embedText(env, text) {
  if (!text || !text.trim()) return null;
  const r = await env.AI.run(EMBEDDING_MODEL, { text });
  return r.data[0];
}

async function upsertEmbedding(env, diaryId, userId, content) {
  if (!content || content.trim().length < 2) return;
  const vec = await embedText(env, content);
  if (!vec) return;
  const json = float32ToJson(vec);
  await env.DB.prepare(
    'INSERT INTO diary_embeddings (diary_id, user_id, content, vector) VALUES (?, ?, ?, ?) ON CONFLICT(diary_id) DO UPDATE SET content=excluded.content, vector=excluded.vector'
  ).bind(diaryId, userId, content, json).run();
}

async function embedDiaryInBackground(env, diaryId, userId, body) {
  try {
    const row = await env.DB.prepare('SELECT title, body FROM diaries WHERE id = ?').bind(diaryId).first();
    const content = extractDiaryText({ title: row?.title, body: row?.body });
    if (!content) return;
    await upsertEmbedding(env, diaryId, userId, content);
  } catch (e) { console.error('[embedDiaryInBackground] 失败:', e.message); }
}

// 问候/闲聊关键词（命中则不查日记，直接友好回复）
const GREETING_PATTERNS = [
  /^(你好|您好|哈喽|嗨|hi|hello|hey|早上好|下午好|晚上好|在吗|在不在|哦|嗯|ok|好的|好)\??$/i,
  /你是谁|你叫什么|你是什么|介绍.*自己|自我介绍/,
  /谢谢|感谢|thx|thanks|再见|拜拜|bye|goodbye/,
  /吃了吗|吃饭了吗|睡了吗|冷吗|热吗|天气怎么样|天气好吗/,
];
function isGreeting(q) {
  const t = q.trim().toLowerCase();
  return GREETING_PATTERNS.some((re) => re.test(t));
}
// 不带日记的友好回复（给问候/闲聊用）
async function callChatFriendly(env, question) {
  const sys = '你是温暖的日记 AI 助手。友好、简洁、口语化，适当加 emoji。可以介绍自己能帮用户找日记、统计、回忆。';
  const r = await env.AI.run(LLM_MODEL, {
    messages: [{ role: 'system', content: sys }, { role: 'user', content: question }],
    max_tokens: 256,
  });
  return r.response || '';
}

async function callWorkersAI_LLM(env, question, context, topK, totalIndexed, history) {
  const sys = `你是温暖的日记 AI 助手。

规则：
1. 依据给你的日记片段回答问题，口语化，可加少量 emoji
2. 统计/计数类问题（多少、几篇、总共、统计）：先告诉用户"你一共有 N 篇日记"（N=totalIndexed），然后说"我找到其中最相关的 M 篇"（M=topK），再基于这 M 篇回答
3. "我找到 M 篇"是指语义检索后最相关的 M 篇，不是总共只有 M 篇——不要让用户误以为剩下的日记丢失了
4. 如果没找到相关日记，也要友好说"这个好像没找到呢～你可以试试别的问题，比如'最近花了多少钱'、'我最开心的一天'之类的 😊"，不要干巴巴说"没找到"
5. 如果片段内容和问题不相关，诚实说"我看到的片段里好像没有相关内容哦"
6. 能接上下文追问（"为什么"、"那之前呢"等），结合历史对话理解`;
  const user = `【事实】
- 用户一共有 **${totalIndexed}** 篇已索引日记
- 下面列出语义最相关的 ${topK} 篇（其余 ${Math.max(0, totalIndexed - topK)} 篇和这个问题不直接相关）

${context}

问题：${question}

回答统计类问题（多少/几篇/总共）时，必须先说"你一共有 ${totalIndexed} 篇日记"。`;
  const msgs = [{ role: 'system', content: sys }];
  if (Array.isArray(history)) {
    for (const h of history) {
      if (h && (h.role === 'user' || h.role === 'assistant') && h.content) {
        msgs.push({ role: h.role, content: String(h.content).slice(0, 500) });
      }
    }
  }
  msgs.push({ role: 'user', content: user });
  const r = await env.AI.run(LLM_MODEL, { messages: msgs, max_tokens: 512 });
  return r.response || '';
}

async function handleAsk(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { question, history } = await request.json();
  if (!question || !question.trim()) return json({ error: 'question required' }, 400);
  // 问候/闲聊 → 直接友好回复，不查日记
  if (isGreeting(question)) {
    try {
      const answer = await callChatFriendly(env, question);
      return json({ answer, sources: [] });
    } catch (e) {
      return json({ answer: '你好呀～我在呢 😊 你可以问我关于你日记的问题哦' });
    }
  }
  try {
    const qVec = await embedText(env, question);
    if (!qVec) return json({ error: 'embed failed' }, 500);
    const rows = await env.DB.prepare(
      'SELECT diary_id, content, vector FROM diary_embeddings WHERE user_id = ? ORDER BY diary_id DESC LIMIT 50'
    ).bind(user.uid).all();
    const scored = rows.results
      .map(r => ({ ...r, score: cosineSimilarity(qVec, jsonToFloat32(r.vector)) }))
      .sort((a, b) => b.score - a.score);
    const totalIndexed = rows.results.length;
    const topK = Math.min(10, totalIndexed);   // 放宽到最多 10 篇
    const top = scored.slice(0, topK);
    const contextParts = top.map((s, i) => `[${i+1}] ${s.content.slice(0, 400)}`);
    const context = contextParts.join('\n\n');
    let answer;
    try { answer = await callWorkersAI_LLM(env, question, context, topK, totalIndexed, history); }
    catch (e) { answer = 'LLM 错: ' + e.message; }
    return json({ answer, sources: top.map(s => ({ diary_id: s.diary_id, score: Math.round(s.score*1000)/1000 })) });
  } catch (e) { return json({ error: e.message }, 500); }
}

async function handleReindex(request, env, JWT_SECRET) {
  const user = await authUser(request, JWT_SECRET);
  if (!user) return json({ error: 'unauthorized' }, 401);
  try {
    const diaries = await env.DB.prepare(
      "SELECT id, title, body FROM diaries WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '') ORDER BY created_at DESC"
    ).bind(user.uid).all();
    const total = diaries.results.length;
    let done = 0;
    for (const d of diaries.results) {
      try {
        const content = extractDiaryText({ title: d.title, body: d.body });
        if (content) { await upsertEmbedding(env, d.id, user.uid, content); done++; }
      } catch (e) { console.error('[reindex] 失败:', d.id, e.message); }
    }
    return json({ ok: true, total, done });
  } catch (e) { return json({ error: e.message }, 500); }
}
