// Cloud API client — talks to Cloudflare Workers
// 开发环境: 直连 dev Worker 绝对地址 (绕开 Vite proxy —— Node.js 在本 Windows 上连不了海外 HTTPS)
// 生产环境: 相对路径走 Pages Functions 同域代理 (绕开 iPhone Safari 对 workers.dev 的封锁)

import type { Diary } from "./types";

// DEV → 绝对地址 dev Worker
// PROD → 空字符串 → 相对路径 /api/* → Pages Functions 代理
// 可通过 VITE_API_BASE 环境变量覆盖
const envBase = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE;
export const API_BASE =
  envBase !== undefined ? envBase :
  (import.meta.env.DEV ? "https://mydiary-api-dev.mcartneyliu.workers.dev" : "");

const TOKEN_KEY = "mydiary-web:auth:token";

/** 存 token */
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    // 401 → token 过期，清掉
    if (res.status === 401) setToken(null);
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${err}`);
  }
  return (await res.json()) as T;
}

// ====== Auth ======
export interface AuthUser { id: string; email: string; nickname: string }
export interface AuthResult { token: string; user: AuthUser }

export function register(email: string, password: string, nickname?: string) {
  return request<AuthResult>("/api/auth/register", {
    method: "POST", body: JSON.stringify({ email, password, nickname }),
  }, false);
}
export function login(email: string, password: string) {
  return request<AuthResult>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  }, false);
}
export function me() {
  return request<{ user: AuthUser }>("/api/auth/me");
}
export function logout() { setToken(null); }

// ====== Diaries ======
export function listDiaries(params?: { from?: string; to?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return request<{ diaries: Diary[] }>(`/api/diaries${q ? "?" + q : ""}`);
}
export function upsertDiary(d: Diary) {
  return request<{ id: string }>("/api/diaries", { method: "POST", body: JSON.stringify({
    id: d.id, date: d.date, template_id: d.templateId, title: d.title,
    mood_id: d.moodId, tags: d.tags, weather: d.weather, blocks: d.blocks,
    milestone_info: d.milestoneInfo, // ⭐ milestone 模板专用
    plan_info: d.planInfo, // ⭐ plan 模板专用
  })});
}
export function deleteDiary(id: string) {
  return request<{ ok: boolean }>(`/api/diaries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ====== Profile ======
export interface ProfileStats { total_diaries: number; streak_days: number; total_words: number }
export interface ProfileResult { user: AuthUser; profile: any; stats: ProfileStats }

export function getProfile() {
  return request<ProfileResult>("/api/profile");
}
export function patchProfile(patch: Record<string, any>) {
  return request<{ ok: boolean }>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) });
}

// ====== 测试/工具 ======
export function healthCheck() {
  try { return fetch(`${API_BASE}/api/auth/me`).then(r => r.status !== 404).catch(() => false); } catch { return false; }
}

// Whisper 语音转文字（本地 → 云端 fallback）
export async function transcribeAudio(blob: Blob): Promise<string> {
  const headers = { "Content-Type": "application/octet-stream" };
  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: blob, headers });
    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      if (data.text?.trim()) return data.text.trim();
    }
  } catch {}
  const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: blob, headers });
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

// ====== Feedback ======
export function submitFeedback(payload: { type?: string; title?: string; content: string; app_version?: string; device?: string }) {
  return request("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_version: "0.1.0", ...payload }),
  });
}

// ====== Templates ======
export interface UserTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  blocks: Diary["blocks"];
  default_title: string;
  default_tags: string[];
  wallpaper: string;
  show_lines: boolean;
  default_mood_id: string;
  is_public: boolean;
  author_id: string;
  author_name: string;
  is_owner: boolean;
  created_at: number;
  updated_at: number;
}

export function saveTemplate(payload: {
  name: string; icon?: string; description?: string;
  blocks: Diary["blocks"]; default_title?: string; default_tags?: string[];
  wallpaper?: string; show_lines?: boolean; default_mood_id?: string;
}) {
  return request<{ id: string; ok: boolean }>("/api/templates", {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function listTemplates(scope: "mine" | "public" | "all" = "mine") {
  return request<{ templates: UserTemplate[] }>(`/api/templates?scope=${scope}`);
}

export function deleteTemplate(id: string) {
  return request<{ ok: boolean }>(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function updateTemplate(patch: Partial<UserTemplate> & { id: string }) {
  return request<{ ok: boolean }>("/api/templates", { method: "PATCH", body: JSON.stringify(patch) });
}

export function shareTemplate(id: string, is_public: boolean) {
  return request<{ ok: boolean }>("/api/templates/share", {
    method: "PATCH", body: JSON.stringify({ id, is_public }),
  });
}

// ====== Papers (信纸库) ======
export interface UserPaper {
  id: string;
  name: string;
  description: string;
  image_data: string;
  thumbnail: string;
  show_lines: boolean;
  is_public: boolean;
  author_id: string;
  author_name: string;
  is_owner: boolean;
  created_at: number;
  updated_at: number;
}

export function savePaper(payload: {
  name: string; description?: string; image_data: string; thumbnail?: string; show_lines?: boolean;
}) {
  return request<{ id: string; ok: boolean }>("/api/papers", {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function listPapers(scope: "mine" | "public" | "all" = "mine") {
  return request<{ papers: UserPaper[] }>(`/api/papers?scope=${scope}`);
}

export function deletePaper(id: string) {
  return request<{ ok: boolean }>(`/api/papers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function sharePaper(id: string, is_public: boolean) {
  return request<{ ok: boolean }>("/api/papers/share", {
    method: "PATCH", body: JSON.stringify({ id, is_public }),
  });
}

// ====== Milestones ======
export type MilestoneType = "fixed" | "start" | "countdown";

export interface Milestone {
  id: string;
  type: MilestoneType;
  target_mm?: number | null;
  target_dd?: number | null;
  start_date?: string | null;
  target_date?: string | null;
  icon: string;
  title: string;
  description: string;
  diary_id?: string | null;
  auto_created: boolean;
  created_at: number;
  updated_at: number;
}

export function saveMilestone(payload: {
  type: MilestoneType;
  target_mm?: number; target_dd?: number;
  start_date?: string; target_date?: string;
  icon?: string; title: string; description?: string;
  diary_id?: string; auto_created?: boolean;
}) {
  return request<{ id: string; ok: boolean }>("/api/milestones", {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function listMilestones() {
  return request<{ milestones: Milestone[] }>("/api/milestones");
}

export function deleteMilestone(id: string) {
  return request<{ ok: boolean }>(`/api/milestones?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function updateMilestone(patch: Partial<Milestone> & { id: string }) {
  return request<{ ok: boolean }>("/api/milestones", {
    method: "PATCH", body: JSON.stringify(patch),
  });
}

// ====== Plans ======
export type PlanStatus = "pending" | "completed" | "overdue";

export interface Plan {
  id: string;
  target_date?: string | null;
  status: PlanStatus;
  icon: string;
  title: string;
  description: string;
  diary_id?: string | null;
  auto_created: boolean;
  created_at: number;
  updated_at: number;
  days_until?: number | null;
}

export function savePlan(payload: {
  target_date?: string; status?: PlanStatus;
  icon?: string; title: string; description?: string;
  diary_id?: string; auto_created?: boolean;
}) {
  return request<{ id: string; ok: boolean }>("/api/plans", {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function listPlans() {
  return request<{ plans: Plan[] }>("/api/plans");
}

export function deletePlan(id: string) {
  return request<{ ok: boolean }>(`/api/plans?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function updatePlan(patch: Partial<Plan> & { id: string }) {
  return request<{ ok: boolean }>("/api/plans", {
    method: "PATCH", body: JSON.stringify(patch),
  });
}