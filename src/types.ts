export type MoodId = "happy" | "calm" | "sad" | "angry" | "anxious";

export interface MoodTag {
  id: MoodId;
  name: string;
  icon: string;
  color: string; // hex e.g. "#ffcf5c"
}

export type BlockKind = "text" | "image" | "audio";

export interface DiaryBlock {
  id: string;
  kind: BlockKind;
  content: string;           // text: 文本 / image: dataURL / audio: dataURL
  durationMs?: number;       // 仅 audio
}

export interface WeatherInfo {
  temp: number;       // Celsius
  description: string; // "晴朗" / "小雨"
  icon: string;        // emoji ☀️🌧️
}

export interface LocationInfo {
  name: string;        // "北京" / 逆地理编码结果
  lat?: number;
  lon?: number;
}

export interface Diary {
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: MoodId | null;
  blocks: DiaryBlock[];
  weather?: WeatherInfo;     // 自动记录
  location?: LocationInfo;   // 自动记录
  promptId?: string;         // 用了哪个每日 Prompt
  capsuleUnlockAt?: number;  // 时间胶囊：设定后日记锁定，直到此时间戳解锁
  tags?: string[];           // 标签，比如 ["工作", "旅行", "感恩"]
  deletedAt?: number;        // 软删时间戳，undefined 表示未删除
  wallpaper?: string;        // 壁纸图片 dataURL（undefined=默认米白色）
  showLines?: boolean;       // 是否显示横线（默认 true）
  createdAt: number;
  updatedAt: number;
}

export function uid(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
