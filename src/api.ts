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
    milestone_info: d.milestoneInfo,
    plan_info: d.planInfo,
    deleted_at: d.deletedAt ?? null,
    capsule_unlock_at: d.capsuleUnlockAt ?? null,
    wallpaper: d.wallpaper ?? null,
    show_lines: d.showLines ?? 1,
  })});
}
export function deleteDiary(id: string, forceHardDelete = false) {
  const q = forceHardDelete ? `?id=${encodeURIComponent(id)}&force=1` : `?id=${encodeURIComponent(id)}`;
  return request<{ ok: boolean }>(`/api/diaries${q}`, { method: "DELETE" });
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
// ====== Daily Summaries ======
export interface DailySummary {
  user_id: string;
  date: string;
  summary: string;
  diary_count: number;
  created_at: number;
  updated_at: number;
}

export function saveSummary(date: string, summary: string, diary_count = 0) {
  return request<{ ok: boolean }>('/api/summaries', {
    method: 'POST',
    body: JSON.stringify({ date, summary, diary_count }),
  });
}

export function listSummaries() {
  return request<{ summaries: DailySummary[] }>('/api/summaries');
}

// AI 知识库问答
export function askDiary(question: string, history?: { role: "user" | "assistant"; content: string }[]) {
  return request<{ answer: string; sources: { diary_id: string; date?: string; score: number; content?: string }[] }>('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
}

// 长期记忆
export function listMemory() {
  return request<{ memories: { id: number; type: string; content: string; confidence: number; status: string; created_at: string }[] }>('/api/memory');
}
export function addMemory(type: string, content: string, confidence = 0.7) {
  return request<{ ok: boolean; id: number }>('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content, confidence }),
  });
}
export function deleteMemory(id: number) {
  return request<{ ok: boolean }>(`/api/memory?id=${id}`, { method: 'DELETE' });
}
export function extractMemory(text: string) {
  return request<{ memories: { type: string; content: string; confidence: number }[] }>('/api/memory/extract', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// ====== Wiki 知识库 v4 ======
export interface WikiKB { id: string; title: string; created_at: number; updated_at: number; }
export interface WikiCategory {
  id: string; kb_id: string; user_id: string; name: string; slug: string;
  sort_order: number; extract_hints: string; page_format: string;
  created_at: number; updated_at: number;
}
export interface WikiSource {
  id: string; kb_id?: string | null; user_id?: string; kind: string;
  ref_id?: string | null; title?: string | null; raw_text: string;
  tags?: string | null; ingested: number; ingested_at?: number | null; created_at: number;
}
export interface WikiPage {
  id: string; kb_id: string; category_id: string | null; title: string;
  content: string; is_system: number; created_at: number; updated_at: number; summary?: string;
}
export interface WikiLink { from_title: string; to_title: string; relation: string; }

export function wikiListKbs() { return request<{ kbs: WikiKB[] }>('/api/wiki/kbs'); }
export function wikiAddKb(title: string) { return request<WikiKB>('/api/wiki/kbs', { method: 'POST', body: JSON.stringify({ title }) }); }
export function wikiUpdateKb(kbId: string, title: string) { return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId, { method: 'PATCH', body: JSON.stringify({ title }) }); }
export function wikiDeleteKb(kbId: string) { return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId, { method: 'DELETE' }); }

export function wikiListCategories(kbId: string) { return request<{ categories: WikiCategory[]; kb: WikiKB }>('/api/wiki/kbs/' + kbId + '/categories'); }
export function wikiAddCategory(kbId: string, cat: { name: string; page_format?: string }) {
  return request<{ id: string; name: string; slug: string; ok: boolean }>('/api/wiki/kbs/' + kbId + '/categories', { method: 'POST', body: JSON.stringify(cat) });
}
export function wikiUpdateCategory(kbId: string, patch: { id: string; name?: string; page_format?: string }) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/categories', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function wikiDeleteCategory(kbId: string, id: string) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/categories?id=' + encodeURIComponent(id), { method: 'DELETE' });
}

export function wikiListSources(kbId: string) { return request<{ sources: WikiSource[] }>('/api/wiki/kbs/' + kbId + '/sources'); }
export function wikiAddSourceText(kbId: string, text: string, title?: string) {
  return request<{ source_id: string; ok: boolean }>('/api/wiki/kbs/' + kbId + '/sources/text', { method: 'POST', body: JSON.stringify({ text, title }) });
}
export async function wikiUploadSourceFile(kbId: string, file: File) {
  const token = localStorage.getItem('token') || '';
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/wiki/kbs/' + kbId + '/sources/file', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as { id: string; ok: boolean; title: string; chars: number };
}
export function wikiDeleteSource(kbId: string, sourceId: string) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/sources/' + sourceId, { method: 'DELETE' });
}
export function wikiBatchDeleteSources(kbId: string, ids: string[]) {
  return request<{ ok: boolean; deleted: number }>('/api/wiki/kbs/' + kbId + '/sources/batch', { method: 'DELETE', body: JSON.stringify({ ids }) });
}

export function wikiListPages(kbId: string) { return request<{ pages: WikiPage[] }>('/api/wiki/kbs/' + kbId + '/pages'); }
export function wikiGetPage(kbId: string, pageId: string) {
  return request<{ page: WikiPage; outlinks: WikiLink[]; backlinks: WikiLink[] }>('/api/wiki/kbs/' + kbId + '/pages/' + pageId);
}
export function wikiSearch(kbId: string, q: string) {
  return request<{ results: { id: string; title: string; summary: string; updated_at: number }[] }>('/api/wiki/kbs/' + kbId + '/search?q=' + encodeURIComponent(q));
}

export interface WikiGraphNode {
  id: string; title: string; category: string | null; is_system: boolean;
}
export interface WikiGraphEdge { source: string; target: string; }
export function wikiGraph(kbId: string) {
  return request<{ nodes: WikiGraphNode[]; links: WikiGraphEdge[] }>('/api/wiki/kbs/' + kbId + '/graph');
}
export function wikiIngestAll(kbId: string, ids?: string[]) {
  const body = ids ? JSON.stringify({ ids }) : undefined;
  return request<{ ok: boolean; message?: string; ingested_count: number; created: number; updated: number; links_added: number; pages: { title: string; category_slug: string; summary: string }[] }>('/api/wiki/kbs/' + kbId + '/ingest', { method: 'POST', body });
}

// ====== 范本库 v4.1 ======
export interface WikiTemplate {
  id: string; name: string; description?: string; extract_hints: string; page_format: string;
  kind: 'official' | 'user'; builtin_key?: string;
}
export function wikiListTemplates(kbId: string) {
  return request<{ official: WikiTemplate[]; mine: WikiTemplate[] }>('/api/wiki/kbs/' + kbId + '/templates');
}
export function wikiAddTemplate(kbId: string, tpl: { name: string; description?: string; extract_hints?: string; page_format?: string }) {
  return request<{ id: string; name: string; ok: boolean }>('/api/wiki/kbs/' + kbId + '/templates', { method: 'POST', body: JSON.stringify(tpl) });
}
export function wikiDeleteTemplate(kbId: string, id: string) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/templates?id=' + encodeURIComponent(id), { method: 'DELETE' });
}
export function wikiBindTemplate(kbId: string, templateId: string, categoryId: string) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/templates/bind', { method: 'POST', body: JSON.stringify({ template_id: templateId, category_id: categoryId }) });
}
export async function wikiUpdatePage(kbId: string, pageId: string, data: { content?: string; summary?: string; title?: string; category_id?: string | null }) {
  return request<{ ok: boolean }>('/api/wiki/kbs/' + kbId + '/pages/' + pageId, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function wikiGenerateEntity(kbId: string, data: { entity_name: string; source_text: string; category_id?: string }) {
  return request<{ ok: boolean; page_id?: string; already_exists?: boolean }>('/api/wiki/kbs/' + kbId + '/generate-entity', { method: 'POST', body: JSON.stringify(data) });
}

// ====== 全局资料（不绑定某个 KB） ======
export function wikiGlobalListSources(tag?: string) {
  const q = tag ? '?tag=' + encodeURIComponent(tag) : '';
  return request<{ sources: WikiSource[] }>('/api/wiki/sources' + q);
}
export function wikiGlobalAddSource(data: { title?: string; text: string; kind?: string; tags?: string[]; kb_id?: string | null }) {
  return request<{ source_id: string; ok: boolean }>('/api/wiki/sources', { method: 'POST', body: JSON.stringify(data) });
}
export function wikiGlobalDeleteSource(sourceId: string) {
  return request<{ ok: boolean }>('/api/wiki/sources/' + sourceId, { method: 'DELETE' });
}
export function wikiUpdateSourceTags(sourceId: string, tags: string[]) {
  return request<{ ok: boolean }>('/api/wiki/sources/' + sourceId + '/tags', { method: 'PATCH', body: JSON.stringify({ tags }) });
}
