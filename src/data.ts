import type { MoodTag } from "./types";

export const MOOD_TAGS: MoodTag[] = [
  { id: "happy",   name: "开心", icon: "😊", color: "#ffcf5c" },
  { id: "calm",    name: "平静", icon: "🌿", color: "#9fd9b4" },
  { id: "anxious", name: "焦虑", icon: "😰", color: "#f4a742" },
  { id: "sad",     name: "难过", icon: "😢", color: "#7ba3d9" },
  { id: "angry",   name: "生气", icon: "😤", color: "#e57373" },
];

export const MOOD_MAP: Record<string, MoodTag> = Object.fromEntries(
  MOOD_TAGS.map((m) => [m.id, m])
);

export function moodById(id: string | null | undefined): MoodTag | null {
  return id ? MOOD_MAP[id] ?? null : null;
}

// 日期工具
export function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today(): string { return fmtDate(new Date()); }
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function monthCells(year: number, monthIdx0: number): Date[] {
  // 返回 42 个 Date，week 从周一开始
  const first = new Date(year, monthIdx0, 1);
  const dow = (first.getDay() + 6) % 7; // 周一=0
  const start = new Date(year, monthIdx0, 1 - dow);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}
