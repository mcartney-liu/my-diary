// Cloud API client — talks to Cloudflare Workers
// Falls back to in-memory if offline (local cache)

import type { Diary } from "./types";

export const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  "https://mydiary-api.mcartneyliu.workers.dev";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${err}`);
  }
  return (await res.json()) as T;
}

export async function listDiaries(params?: { month?: string; date?: string }) {
  const qs = new URLSearchParams();
  if (params?.month) qs.set("month", params.month);
  if (params?.date) qs.set("date", params.date);
  const q = qs.toString();
  return request<Diary[]>(`/api/diaries${q ? "?" + q : ""}`);
}

export async function getDiary(id: string) {
  return request<Diary>(`/api/diaries/${id}`);
}

export async function upsertDiary(d: Diary) {
  return request<{ id: string }>("/api/diaries", {
    method: "POST",
    body: JSON.stringify(d),
  });
}

export async function updateDiary(d: Diary) {
  return request<{ updatedAt: number }>("/api/diaries", {
    method: "PUT",
    body: JSON.stringify(d),
  });
}

export async function deleteDiary(id: string) {
  return request<{ ok: boolean }>(`/api/diaries/${id}`, { method: "DELETE" });
}

// Sync: 客户端推送本地变更 + 拉取远端新增
export async function sync(body: { lastSync: number; diaries: Diary[] }) {
  return request<{ serverTime: number; diaries: Diary[] }>("/api/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function healthCheck() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

// Whisper 语音转文字
// 优先走 Vite proxy → 本地 Whisper 服务（localhost:8080）
// 本地没起 → fallback 到 Cloudflare Worker
export async function transcribeAudio(blob: Blob): Promise<string> {
  const body = blob;
  const headers = { "Content-Type": "application/octet-stream" };

  // 1) 本地 Whisper 服务（Vite proxy 会把 /api/transcribe 转到 localhost:8080）
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      body,
      headers,
    });
    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      if (data.text && data.text.trim()) {
        console.info("[mydiary] transcribeAudio: 本地 Whisper 成功");
        return data.text.trim();
      }
    }
    console.info("[mydiary] transcribeAudio: 本地服务不可用（%s），尝试云端", res.status);
  } catch (e) {
    console.info("[mydiary] transcribeAudio: 本地没起，尝试云端");
  }

  // 2) Fallback: Cloudflare Worker
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    body,
    headers,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${err}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}
