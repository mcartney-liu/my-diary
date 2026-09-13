import type { Diary, MoodTag } from "./types";

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
  const first = new Date(year, monthIdx0, 1);
  const dow = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIdx0, 1 - dow);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

// 每日写作 Prompt
export const PROMPTS = [
  "今天最让你感动的事是？",
  "如果用一个词形容今天，会是什么？",
  "此刻你最想对自己说什么？",
  "今天遇到的最难的事是什么？你是怎么面对的？",
  "有什么事你做了但没告诉任何人？",
  "今天让你微笑的人或事是？",
  "如果你能对 3 年前的自己说一句话，会说什么？",
  "今天你的身体在说什么？（累/痛/放松/兴奋）",
  "最近一次感到平静是什么时候？",
  "有什么决定你一直在纠结？",
  "今天你给了自己多少耐心？",
  "如果明天不用工作，你最想做什么？",
  "最近在害怕什么？它真的会发生吗？",
  "今天你最想感谢的人是谁？",
  "描述一个让你感到安全的地方。",
  "你最近在逃避什么？",
  "三年后你希望自己在做什么？",
  "今天的声音、气味、颜色——印象最深的是？",
  "你给自己的评价是？（0-10）为什么？",
  "最近学会了什么新东西？",
];

// 天气 emoji 映射
export const WEATHER_ICONS: Record<string, string> = {
  "晴": "☀️", "晴朗": "☀️",
  "多云": "⛅", "阴": "☁️",
  "小雨": "🌦️", "中雨": "🌧️", "大雨": "🌧️", "暴雨": "⛈️", "阵雨": "🌦️",
  "雷阵雨": "⛈️", "雷暴": "⛈️",
  "小雪": "🌨️", "中雪": "❄️", "大雪": "❄️",
  "雾": "🌫️", "霾": "🌫️",
};
export function weatherIcon(desc: string): string {
  for (const [k, v] of Object.entries(WEATHER_ICONS)) {
    if (desc.includes(k)) return v;
  }
  return "🌤️";
}

// === 统计工具 ===

/** 连续写作天数（Streak），包含今天 */
export function computeStreak(diaries: Diary[]): number {
  const dates = new Set(diaries.map((d) => d.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    if (dates.has(fmtDate(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** 最长连续写作天数 */
export function computeMaxStreak(diaries: Diary[]): number {
  if (!diaries.length) return 0;
  const sorted = [...new Set(diaries.map((d) => d.date))].sort();
  let max = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDate(sorted[i - 1]);
    const now = parseDate(sorted[i]);
    const diff = Math.round((now.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) { cur++; max = Math.max(max, cur); }
    else cur = 1;
  }
  return max;
}

/** On This Day：去年/前年同一天的日记 */
export function onThisDay(diaries: Diary[], refDate = new Date()): Diary[] {
  const mm = pad(refDate.getMonth() + 1);
  const dd = pad(refDate.getDate());
  return diaries.filter((d) => {
    const [, m, day] = d.date.split("-");
    return m === mm && day === dd;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

/** 获取指定年份所有心情数据（热力图用） */
export function yearMoodData(diaries: Diary[], year: number): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of diaries) {
    if (d.date.startsWith(`${year}-`) && d.moodId) {
      m.set(d.date, d.moodId);
    }
  }
  return m;
}

/** 搜索日记（标题 + 所有 block 文本 + 标签） */
export function searchDiaries(
  diaries: Diary[],
  keyword: string,
  moodId?: string | null
): Diary[] {
  const kw = keyword.trim().toLowerCase();
  return diaries
    .filter((d) => {
      if (moodId && d.moodId !== moodId) return false;
      if (!kw) return true;
      if (d.title.toLowerCase().includes(kw)) return true;
      if (d.tags?.some((t) => t.toLowerCase().includes(kw))) return true;
      return d.blocks.some((b) => {
        switch (b.kind) {
          case "text":
          case "heading":
          case "checkbox":
            return b.content.toLowerCase().includes(kw);
          case "number":
            return (b.label ?? "").toLowerCase().includes(kw);
          case "finance_item":
            return (b.content + " " + (b.category ?? "")).toLowerCase().includes(kw);
          default:
            return false;
        }
      });
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
