import type { NewsChannel } from "./api";

// 今日看点：频道 / 分类样式 / 时间显示，今天页卡片和「全部看点」页共用
// 今日看点的频道
export const CHANNEL_META: Record<NewsChannel, { icon: string; name: string; label: string; desc: string }> = {
  news:    { icon: "📰", name: "新闻", label: "今日看点", desc: "每天挑几条和生活有关的新闻，小麦告诉你和你有什么关系" },
  article: { icon: "📖", name: "好文", label: "今日好文", desc: "生活方式、随笔、人物故事，读完会想写点什么" },
  science: { icon: "🔭", name: "科普", label: "涨知识", desc: "自然、宇宙、人体和冷知识，喜欢的可以收进知识库" },
  nature:  { icon: "🏞️", name: "每日一图", label: "每日一图", desc: "国家地理的风景、动物和人文摄影，看一眼放松一下" },
  culture: { icon: "🎬", name: "书影", label: "书和电影", desc: "新书、即将上映的电影和新番，周末看什么、读什么" },
  psy:     { icon: "🧠", name: "心理", label: "心理小站", desc: "情绪、关系、睡眠的小练习，今天就能试一试" },
  quote:   { icon: "🌙", name: "一句话", label: "今日一句", desc: "诗词和好句子，当作今天的写作引子" },
};
export const ALL_CHANNELS = Object.keys(CHANNEL_META) as NewsChannel[];
export const NEWS_TAG_STYLE: Record<string, { icon: string; cls: string }> = {
  生活: { icon: "🏠", cls: "bg-amber-50 text-amber-800" },
  科技: { icon: "🚀", cls: "bg-sky-50 text-sky-700" },
  国际: { icon: "🌏", cls: "bg-indigo-50 text-indigo-700" },
  财经: { icon: "💰", cls: "bg-emerald-50 text-emerald-700" },
  社会: { icon: "📌", cls: "bg-stone-100 text-stone-700" },
  体育: { icon: "⚽", cls: "bg-orange-50 text-orange-700" },
  文娱: { icon: "🎬", cls: "bg-pink-50 text-pink-700" },
  健康: { icon: "🍎", cls: "bg-rose-50 text-rose-700" },
  // 好文
  人物: { icon: "👤", cls: "bg-violet-50 text-violet-700" },
  随笔: { icon: "✍️", cls: "bg-stone-100 text-stone-700" },
  读书: { icon: "📚", cls: "bg-amber-50 text-amber-800" },
  旅行: { icon: "🧳", cls: "bg-sky-50 text-sky-700" },
  美食: { icon: "🍜", cls: "bg-orange-50 text-orange-700" },
  成长: { icon: "🌱", cls: "bg-emerald-50 text-emerald-700" },
  // 心理
  // 科普（科技 / 历史 / 健康 已有）
  自然: { icon: "🌿", cls: "bg-emerald-50 text-emerald-700" },
  宇宙: { icon: "🪐", cls: "bg-indigo-50 text-indigo-700" },
  生命: { icon: "🧬", cls: "bg-teal-50 text-teal-700" },
  人体: { icon: "🫀", cls: "bg-rose-50 text-rose-700" },
  历史: { icon: "🏺", cls: "bg-amber-50 text-amber-800" },
  冷知识: { icon: "💡", cls: "bg-yellow-50 text-yellow-700" },
  // 心理
  // 每日一图
  风景: { icon: "🏔️", cls: "bg-emerald-50 text-emerald-700" },
  动物: { icon: "🐾", cls: "bg-orange-50 text-orange-700" },
  人文: { icon: "🏮", cls: "bg-rose-50 text-rose-700" },
  海洋: { icon: "🌊", cls: "bg-sky-50 text-sky-700" },
  天空: { icon: "🌌", cls: "bg-indigo-50 text-indigo-700" },
  // 书影
  新书: { icon: "📕", cls: "bg-amber-50 text-amber-800" },
  电影: { icon: "🎞️", cls: "bg-stone-100 text-stone-700" },
  动画: { icon: "✨", cls: "bg-pink-50 text-pink-700" },
  展览: { icon: "🖼️", cls: "bg-violet-50 text-violet-700" },
  情绪: { icon: "💗", cls: "bg-rose-50 text-rose-700" },
  关系: { icon: "🤝", cls: "bg-violet-50 text-violet-700" },
  自我: { icon: "🪞", cls: "bg-indigo-50 text-indigo-700" },
  睡眠: { icon: "😴", cls: "bg-sky-50 text-sky-700" },
  压力: { icon: "🎈", cls: "bg-amber-50 text-amber-800" },
  亲子: { icon: "🧸", cls: "bg-orange-50 text-orange-700" },
  习惯: { icon: "⏰", cls: "bg-emerald-50 text-emerald-700" },
  一句话: { icon: "🌙", cls: "bg-indigo-50 text-indigo-700" },
};

// 一天只更新一次的频道：时间只写到「今天 / 昨天 / 几月几日」，不写几点几分
export const DAILY_CHANNELS: NewsChannel[] = ["nature", "culture"];

const pad = (n: number) => (n < 10 ? "0" + n : String(n));
/** 条目时间：今天写「刚刚 / N 分钟前 / N 小时前」，往前写「昨天 18:20」「11/25 09:10」 */
export function newsTime(ts?: number, channel?: NewsChannel): string {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.floor((startToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const daily = channel && DAILY_CHANNELS.includes(channel);
  if (dayDiff <= 0) {
    if (daily) return "今天";
    const min = Math.floor((now.getTime() - ts) / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    return `${Math.floor(min / 60)} 小时前`;
  }
  if (dayDiff === 1) return daily ? "昨天" : `昨天 ${hm}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return daily ? `${d.getMonth() + 1}月${d.getDate()}日` : `${md} ${hm}`;
}
/** 分组标题：今天 / 昨天 · 11月26日 / 11月25日 周三 */
export function newsDayTitle(day: string, todayStr: string, yesterdayStr: string): string {
  const m = Number(day.slice(5, 7)), dd = Number(day.slice(8));
  if (day === todayStr) return "今天";
  if (day === yesterdayStr) return `昨天 · ${m}月${dd}日`;
  const w = "日一二三四五六"[new Date(day + "T00:00:00").getDay()];
  return `${m}月${dd}日 周${w}`;
}

// 带着预填内容打开编辑器（复用语音快记的 sessionStorage 通道，见 App.tsx EditorPageWrapper）
export function openEditorWith(nav: (p: string) => void, opts: { prompt?: string; moodId?: string; title?: string; body?: string; tags?: string[] }) {
  const rid = () => "t" + Math.random().toString(36).slice(2, 10);
  const blocks: any[] = [];
  if (opts.prompt) blocks.push({ id: rid(), kind: "quote", content: opts.prompt });
  // body：直接写进正文（比 quote 块更稳，任何模板都会显示），光标接着往下写
  blocks.push({ id: rid(), kind: "text", content: opts.body || "" });
  try {
    sessionStorage.setItem("mydiary.quickentry", JSON.stringify({
      templateId: "diary", ts: Date.now(),
      polished: { title: opts.title || "", blocks, mood: opts.moodId, tags: opts.tags || [] },
    }));
  } catch {}
  nav("/editor?template=diary");
}
