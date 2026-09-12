// Cloudflare Workers API for MyDiary
// D1 SQLite-backed, no auth needed (personal use)

interface Env {
  DB: D1Database;
  AI: Ai;
}

interface DiaryRow {
  id: string;
  title: string;
  date: string;
  mood_id: string | null;
  blocks_json: string;
  created_at: number;
  updated_at: number;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function handleDiaries(req: Request, db: D1Database): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/diaries?date=2026-09-11 或 GET /api/diaries?month=2026-09
  if (req.method === "GET") {
    const dateParam = url.searchParams.get("date");
    const monthParam = url.searchParams.get("month");

    let query = "SELECT * FROM diaries WHERE 1=1";
    const params: unknown[] = [];

    if (dateParam) {
      query += " AND date = ?";
      params.push(dateParam);
    } else if (monthParam) {
      // monthParam 格式 "YYYY-MM"
      query += " AND date LIKE ?";
      params.push(`${monthParam}%`);
    }

    query += " ORDER BY updated_at DESC";

    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).all<DiaryRow>();

    const diaries = result.results.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      moodId: r.mood_id,
      blocks: JSON.parse(r.blocks_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return jsonResponse(diaries);
  }

  // POST /api/diaries — 创建新日记
  if (req.method === "POST") {
    const body = (await req.json()) as {
      id?: string;
      title: string;
      date: string;
      moodId?: string | null;
      blocks: unknown[];
    };

    const now = Date.now();
    const id = body.id ?? crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO diaries (id, title, date, mood_id, blocks_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.title ?? "",
        body.date,
        body.moodId ?? null,
        JSON.stringify(body.blocks),
        now,
        now
      )
      .run();

    return jsonResponse({ id, createdAt: now, updatedAt: now });
  }

  // PUT /api/diaries — 更新日记（upsert by id）
  if (req.method === "PUT") {
    const body = (await req.json()) as {
      id: string;
      title?: string;
      date?: string;
      moodId?: string | null;
      blocks?: unknown[];
    };

    if (!body.id) return jsonResponse({ error: "id required" }, 400);

    const now = Date.now();
    const existing = await db
      .prepare("SELECT id FROM diaries WHERE id = ?")
      .bind(body.id)
      .first();

    if (!existing) {
      // upsert: 不存在就插入
      await db
        .prepare(
          `INSERT INTO diaries (id, title, date, mood_id, blocks_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          body.id,
          body.title ?? "",
          body.date ?? new Date().toISOString().slice(0, 10),
          body.moodId ?? null,
          JSON.stringify(body.blocks ?? []),
          now,
          now
        )
        .run();
    } else {
      // update
      await db
        .prepare(
          `UPDATE diaries SET
             title = COALESCE(?, title),
             date = COALESCE(?, date),
             mood_id = COALESCE(?, mood_id),
             blocks_json = COALESCE(?, blocks_json),
             updated_at = ?
           WHERE id = ?`
        )
        .bind(
          body.title ?? null,
          body.date ?? null,
          body.moodId ?? null,
          body.blocks ? JSON.stringify(body.blocks) : null,
          now,
          body.id
        )
        .run();
    }

    return jsonResponse({ updatedAt: now });
  }

  return jsonResponse({ error: "method not allowed" }, 405);
}

async function handleDiaryById(req: Request, db: D1Database, id: string): Promise<Response> {
  if (req.method === "DELETE") {
    await db.prepare("DELETE FROM diaries WHERE id = ?").bind(id).run();
    return jsonResponse({ ok: true });
  }

  if (req.method === "GET") {
    const row = await db
      .prepare("SELECT * FROM diaries WHERE id = ?")
      .bind(id)
      .first<DiaryRow>();
    if (!row) return jsonResponse({ error: "not found" }, 404);
    return jsonResponse({
      id: row.id,
      title: row.title,
      date: row.date,
      moodId: row.mood_id,
      blocks: JSON.parse(row.blocks_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return jsonResponse({ error: "method not allowed" }, 405);
}

// 批量同步 — 拉取 lastSync 之后所有变更
async function handleSync(req: Request, db: D1Database): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const body = (await req.json()) as {
    lastSync?: number; // Unix ms, 增量同步
    diaries?: Array<{
      id: string; title: string; date: string;
      moodId?: string | null; blocks: unknown[];
      createdAt: number; updatedAt: number;
    }>;
  };

  const lastSync = body.lastSync ?? 0;

  // 1. 接收客户端推送的新增/修改（upsert）
  if (body.diaries && body.diaries.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO diaries (id, title, date, mood_id, blocks_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         date = excluded.date,
         mood_id = excluded.mood_id,
         blocks_json = excluded.blocks_json,
         updated_at = excluded.updated_at`
    );

    await db.batch(
      body.diaries.map((d) =>
        stmt.bind(
          d.id, d.title, d.date, d.moodId ?? null,
          JSON.stringify(d.blocks), d.createdAt, d.updatedAt
        )
      )
    );
  }

  // 2. 返回服务端 lastSync 之后的所有记录（用于客户端拉取远端变更）
  const rows = await db
    .prepare("SELECT * FROM diaries WHERE updated_at > ? ORDER BY updated_at ASC")
    .bind(lastSync)
    .all<DiaryRow>();

  const now = Date.now();
  return jsonResponse({
    serverTime: now,
    diaries: rows.results.map((r) => ({
      id: r.id, title: r.title, date: r.date,
      moodId: r.mood_id, blocks: JSON.parse(r.blocks_json),
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  });
}

// POST /api/transcribe — 接收音频 blob，用 Whisper 转文字
async function handleTranscribe(req: Request, ai: Ai): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    const buffer = await req.arrayBuffer();
    const audioArray = Array.from(new Uint8Array(buffer));

    const result = await ai.run("@cf/openai/whisper", { audio: audioArray });
    return jsonResponse({ text: result.text ?? "" });
  } catch (e) {
    const err = e as Error;
    console.error("transcribe error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /api/transcribe — Whisper 语音转文字
      if (path === "/api/transcribe") {
        return handleTranscribe(request, env.AI);
      }

      // GET /api/health — 健康检查
      if (path === "/api/health") {
        return jsonResponse({ ok: true, time: Date.now() });
      }

      // POST /api/sync — 批量同步接口
      if (path === "/api/sync") {
        return handleSync(request, env.DB);
      }

      // /api/diaries/:id
      const diaryMatch = path.match(/^\/api\/diaries\/([^/]+)$/);
      if (diaryMatch) {
        return handleDiaryById(request, env.DB, diaryMatch[1]);
      }

      // /api/diaries
      if (path === "/api/diaries") {
        return handleDiaries(request, env.DB);
      }

      return jsonResponse({ error: "not found" }, 404);
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
