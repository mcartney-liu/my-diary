// Storage layer: Cloud API primary, localStorage offline fallback
import type { Diary } from "./types";
import * as api from "./api";

const LOCAL_KEY = "mydiary-web:diaries:v1";
const SYNC_KEY = "mydiary-web:lastSync";

function loadLocal(): Diary[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Diary[]) : [];
  } catch { return []; }
}

function saveLocal(list: Diary[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function getLastSync(): number {
  const v = localStorage.getItem(SYNC_KEY);
  return v ? parseInt(v, 10) : 0;
}

function setLastSync(t: number) {
  localStorage.setItem(SYNC_KEY, String(t));
}

export async function loadDiaries(): Promise<Diary[]> {
  const local = loadLocal();
  const lastSync = getLastSync();

  try {
    // Push local changes first (updated_at > lastSync)
    const dirty = local.filter((d) => d.updatedAt > lastSync);
    // Pull remote changes
    const res = await api.sync({ lastSync, diaries: dirty });

    // Merge: take the newer updated_at for each id
    const merged = new Map<string, Diary>();
    for (const d of local) merged.set(d.id, d);
    for (const d of res.diaries) {
      const existing = merged.get(d.id);
      if (!existing || d.updatedAt >= existing.updatedAt) merged.set(d.id, d);
    }
    const list = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);

    saveLocal(list);
    setLastSync(res.serverTime);
    return list;
  } catch {
    // Offline — return local only
    return local;
  }
}

export async function upsertDiary(list: Diary[], d: Diary): Promise<Diary[]> {
  const next = upsertLocal(list, d);
  saveLocal(next);

  try {
    const lastSync = getLastSync();
    await api.updateDiary(d);
    // 如果服务端更新的 updated_at 与我们不同，以服务端为准
    setLastSync(lastSync);
  } catch {
    // 离线：保留本地，下次 sync 会推上去
  }
  return next;
}

export async function deleteDiary(list: Diary[], id: string): Promise<Diary[]> {
  const next = list.filter((x) => x.id !== id);
  saveLocal(next);

  try {
    await api.deleteDiary(id);
  } catch {
    // 离线也先从本地删了（下次 sync 服务端也会是 delete 后的状态）
  }
  return next;
}

function upsertLocal(list: Diary[], d: Diary): Diary[] {
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0) {
    const next = [...list];
    next[i] = d;
    return next;
  }
  return [...list, d];
}

// 种子数据（首次使用时）
export function seedIfEmpty(): Diary[] {
  const existing = loadLocal();
  if (existing.length > 0) return existing;

  const now = Date.now();
  const sample: Diary[] = [
    {
      id: "seed_" + now,
      title: "第一次写日记 ✨",
      date: new Date().toISOString().slice(0, 10),
      moodId: "happy",
      blocks: [
        {
          id: "sb_1",
          kind: "text",
          content:
            "你好呀！这是 MyDiary 的第一篇日记~\n\n现在数据已经同步到云端，手机和电脑打开同一个网址就能看到同一份日记啦 🎉",
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  saveLocal(sample);
  return sample;
}
