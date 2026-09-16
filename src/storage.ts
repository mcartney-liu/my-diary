// Storage layer: 纯 localStorage
// 云端 sync 由 App.tsx 里的 AuthProvider 联动逻辑处理
import type { Diary } from "./types";

const LOCAL_KEY = "mydiary-web:diaries:v1";

function loadLocal(): Diary[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Diary[]) : [];
  } catch { return []; }
}

export function saveLocal(list: Diary[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

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
            "你好呀！这是 MyDiary 的第一篇日记~\n\n登录后数据会自动同步到云端 🎉",
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  saveLocal(sample);
  return sample;
}
