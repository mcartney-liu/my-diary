export type MoodId = "happy" | "calm" | "sad" | "angry" | "anxious";

export interface MoodTag {
  id: MoodId;
  name: string;
  icon: string;
  color: string; // hex e.g. "#ffcf5c"
}

export type BlockKind = "text" | "image" | "audio" | "heading" | "number" | "divider" | "checkbox" | "finance_item" | "book" | "quote";

export interface DiaryBlock {
  id: string;
  kind: BlockKind;
  content: string;           // text: 文本 / image: dataURL / audio: dataURL / heading: 标题 / checkbox: 标签 / finance_item: 备注
  durationMs?: number;       // 仅 audio
  deleted?: boolean;         // 软删除：划掉但还在，保存时才真删
  // === 扩展 kind 的可选字段 ===
  level?: 1 | 2 | 3;         // heading: 标题级别，默认 2
  label?: string;            // number: "支出" / "收入" 等
  value?: number;            // number: 数值
  unit?: string;             // number: 单位 "¥" / "元" / "页"
  checked?: boolean;         // checkbox: 是否勾选
  // === finance_item 专属 ===
  direction?: "expense" | "income"; // 支出 / 收入
  category?: string;         // 分类 key，如 "food" / "transport"
  // === image 专属 ===
  widthPercent?: number;     // 图片宽度百分比 25~150，默认 100
  // === book 专属 ===
  author?: string;           // 作者
  totalPages?: number;       // 总页数
  currentPage?: number;      // 当前页
  bookId?: string;           // 跨日记聚合用（同书名自动匹配）
  // === quote 专属 ===
  pageNumber?: number;       // 摘抄所在页码
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
  templateId?: string;       // 用了哪个模板（diary / finance / reading...）
  capsuleUnlockAt?: number;  // 时间胶囊：设定后日记锁定，直到此时间戳解锁
  tags?: string[];           // 标签，比如 ["工作", "旅行", "感恩"]
  deletedAt?: number;        // 软删时间戳，undefined 表示未删除
  wallpaper?: string;        // 壁纸图片 dataURL（undefined=默认米白色）
  showLines?: boolean;       // 是否显示横线（默认 true）
  // ⭐ milestone 模板专用：保存时传给 Worker，自动双写到 milestones 子表
  milestoneInfo?: {
    type: "fixed" | "start" | "countdown";
    target_mm?: number;
    target_dd?: number;
    start_date?: string;
    target_date?: string;
    title?: string;
    icon?: string;
    description?: string;
  };
  // ⭐ plan 模板专用：保存时传给 Worker，自动双写到 plans 子表
  planInfo?: {
    target_date?: string;
    status?: "pending" | "completed" | "overdue";
    title?: string;
    icon?: string;
    description?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export function uid(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
