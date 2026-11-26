import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { computeStreak, fmtDate, moodById, MOOD_TAGS, PROMPTS, onThisDay } from "../data";
import { templateById } from "../templates";
import { getProfile, listMilestones, listPlans, diaryReply, dailyNote, listNews, newsDays, getToken, lifeRecent, type Milestone, type Plan, type LifeLink, type NewsData, type NewsItem, type NewsChannel } from "../api";
import { fetchLocationAuto, fetchWeather } from "../weather";
import { dayEvents, springFestivalCountdown, weatherTip } from "../today";
import type { WeatherInfo } from "../types";
import { cachedGet, peek } from "../dataCache";
import { toast } from "../uiFeedback";
import LifeLinks from "./LifeLinks";
import Xiaomai, { moodFor } from "./Xiaomai";
import { useHint } from "./useOnce";
import BottomDock from "./BottomDock";
import NewsDetailSheet from "./NewsDetailSheet";
import Modal from "./Modal";
import OnboardingWizard from "./OnboardingWizard";
import FeatureTour, { hasSeenTour, markTourSeen, type TourStep } from "./FeatureTour";

// ☀️ 今天（新首页，信息架构改版阶段 2，见 docs/ia-redesign.md）
// 原则：只放和"今天"有关的东西；没有内容的卡片不显示 —— 新用户看到的只有写入口
interface Props { diaries: Diary[] }

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 小麦的一句话还没生成好（或生成失败）时的本地问候，按时段挑
function localGreeting(hour: number): string {
  if (hour < 5) return "夜深了，今天辛苦啦。想说什么就写几句，写完早点休息 🌙";
  if (hour < 9) return "早上好～新的一天，慢慢来 ☀️";
  if (hour < 12) return "上午好，今天有什么想记下来的吗？";
  if (hour < 14) return "中午了，记得好好吃饭 🍚";
  if (hour < 18) return "下午好，累了就停下来喝口水 🍵";
  if (hour < 22) return "晚上好，今天过得怎么样？";
  return "快到休息的时间了，跟我说说今天吧 🌾";
}

// 今天页顶部氛围：早上暖黄、白天浅蓝、傍晚橙粉、夜里深蓝；下雨 / 下雪加粒子
function skyFor(hour: number, desc?: string) {
  const night = hour >= 19 || hour < 5;
  const grad =
    hour < 5 ? "from-[#1f2a4d] via-[#2c3866] to-[#4b4f80]" :
    hour < 9 ? "from-[#ffe9c7] via-[#ffd9a8] to-[#fbe3c9]" :
    hour < 16 ? "from-[#dcefff] via-[#eef6ff] to-[#fdf6e9]" :
    hour < 19 ? "from-[#ffc9a3] via-[#f7b5a8] to-[#e9c6d9]" :
                "from-[#2b335e] via-[#3c4275] to-[#5a5a8c]";
  const weather = !desc ? "" : /雪/.test(desc) ? "snow" : /雨/.test(desc) ? "rain" : "";
  const deco = night ? "🌙" : /雨/.test(desc || "") ? "🌧️" : /雪/.test(desc || "") ? "❄️" : /云|阴/.test(desc || "") ? "⛅" : "☀️";
  return { grad, night, weather, deco };
}
function Particles({ kind }: { kind: string }) {
  if (!kind) return null;
  const n = kind === "rain" ? 26 : 18;
  return (
    <div className={`sky-particles ${kind === "rain" ? "sky-rain" : "sky-snow"}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDuration: `${kind === "rain" ? 0.8 + (i % 5) * 0.15 : 4 + (i % 6) * 0.8}s`, animationDelay: `${(i % 7) * -0.6}s` }} />
      ))}
    </div>
  );
}

function firstText(d: Diary): string {
  const t = d.blocks.find((b) => (b.kind === "text" || b.kind === "quote") && b.content?.trim())?.content ?? "";
  return t.trim();
}
// 今日看点的分类标签样式
// 今日看点的频道
const CHANNEL_META: Record<NewsChannel, { icon: string; name: string; label: string; desc: string }> = {
  news:    { icon: "📰", name: "新闻", label: "今日看点", desc: "每天挑几条和生活有关的新闻，小麦告诉你和你有什么关系" },
  article: { icon: "📖", name: "好文", label: "今日好文", desc: "生活方式、随笔、人物故事，读完会想写点什么" },
  science: { icon: "🔭", name: "科普", label: "涨知识", desc: "自然、宇宙、人体和冷知识，喜欢的可以收进知识库" },
  psy:     { icon: "🧠", name: "心理", label: "心理小站", desc: "情绪、关系、睡眠的小练习，今天就能试一试" },
  quote:   { icon: "🌙", name: "一句话", label: "今日一句", desc: "诗词和好句子，当作今天的写作引子" },
};
const ALL_CHANNELS = Object.keys(CHANNEL_META) as NewsChannel[];
const NEWS_TAG_STYLE: Record<string, { icon: string; cls: string }> = {
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
  情绪: { icon: "💗", cls: "bg-rose-50 text-rose-700" },
  关系: { icon: "🤝", cls: "bg-violet-50 text-violet-700" },
  自我: { icon: "🪞", cls: "bg-indigo-50 text-indigo-700" },
  睡眠: { icon: "😴", cls: "bg-sky-50 text-sky-700" },
  压力: { icon: "🎈", cls: "bg-amber-50 text-amber-800" },
  亲子: { icon: "🧸", cls: "bg-orange-50 text-orange-700" },
  习惯: { icon: "⏰", cls: "bg-emerald-50 text-emerald-700" },
  一句话: { icon: "🌙", cls: "bg-indigo-50 text-indigo-700" },
};

function firstImage(d: Diary): string | null {
  const b = d.blocks.find((x) => x.kind === "image" && x.content);
  return b ? b.content : null;
}
// 日记内容指纹：内容改了才重新问小麦
function fingerprint(d: Diary): string {
  const raw = (d.title || "") + "|" + d.blocks.map((b) => b.content || "").join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return String(h);
}
function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// 按日期稳定地选一个（同一天打开看到的一样，第二天换）
function dayHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}
// 带着预填内容打开编辑器（复用语音快记的 sessionStorage 通道，见 App.tsx EditorPageWrapper）
function openEditorWith(nav: (p: string) => void, opts: { prompt?: string; moodId?: string; title?: string; body?: string; tags?: string[] }) {
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

// 近期的纪念日 / 倒计时（30 天内）
function upcomingMilestones(list: Milestone[], today: string) {
  const out: { id: string; icon: string; title: string; text: string; days: number }[] = [];
  const year = Number(today.slice(0, 4));
  for (const m of list) {
    if (m.type === "countdown" && m.target_date) {
      const d = daysBetween(today, m.target_date);
      if (d >= 0 && d <= 30) out.push({ id: m.id, icon: m.icon || "⏳", title: m.title, text: d === 0 ? "就是今天！" : `还有 ${d} 天`, days: d });
    } else if (m.type === "fixed" && m.target_mm && m.target_dd) {
      const mm = String(m.target_mm).padStart(2, "0"), dd = String(m.target_dd).padStart(2, "0");
      let next = `${year}-${mm}-${dd}`;
      if (daysBetween(today, next) < 0) next = `${year + 1}-${mm}-${dd}`;
      const d = daysBetween(today, next);
      if (d <= 30) out.push({ id: m.id, icon: m.icon || "🎈", title: m.title, text: d === 0 ? "就是今天 🎉" : `还有 ${d} 天`, days: d });
    } else if (m.type === "start" && m.start_date) {
      const d = daysBetween(m.start_date, today);
      if (d > 0 && (d % 100 === 0 || d % 365 === 0)) out.push({ id: m.id, icon: m.icon || "🌱", title: m.title, text: `第 ${d} 天`, days: 0 });
    }
  }
  return out.sort((a, b) => a.days - b.days).slice(0, 3);
}

// ---------- 小麦的回应（每篇今天的日记下面一句）----------
function XiaomaiReply({ diary }: { diary: Diary }) {
  const nav = useNavigate();
  const key = `mydiary.reply.v1.${diary.id}.${fingerprint(diary)}`;
  const [data, setData] = useState<{ reply: string; ref: { diary_id: string; date: string } | null } | null>(() => {
    try { const c = localStorage.getItem(key); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data || !getToken() || firstText(diary).length < 4) return;
    let cancelled = false;
    setLoading(true);
    diaryReply(diary.id)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        if (r.reply) { try { localStorage.setItem(key, JSON.stringify(r)); } catch {} }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading) return (
    <div className="mt-3 flex items-center gap-2 text-xs text-paper-ink2">
      <Xiaomai mood="thinking" size={28} /> 小麦在读你的日记…
    </div>
  );
  if (!data?.reply) return null;
  return (
    <div className="mt-3 flex items-start gap-2">
      <Xiaomai mood="happy" size={30} className="shrink-0" />
      <div className="flex-1 rounded-2xl rounded-tl-md bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-paper-ink leading-relaxed animate-pop-in">
      {data.reply}
      {data.ref && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); nav(`/editor/${data.ref!.diary_id}`); }}
          className="ml-1 text-xs text-paper-accent hover:underline"
        >
          看看 {data.ref.date} 那篇 ›
        </button>
      )}
      </div>
    </div>
  );
}

export default function TodayPage({ diaries }: Props) {
  const nav = useNavigate();
  const now = new Date();
  const today = fmtDate(now);
  const streak = computeStreak(diaries);

  const [milestones, setMilestones] = useState<Milestone[]>(() => peek<any>("milestones:all")?.milestones ?? []);
  const [plans, setPlans] = useState<Plan[]>(() => peek<any>("plans:all")?.plans ?? []);
  const [profile, setProfile] = useState<any>(() => peek<any>("profile")?.user ?? null);
  const [promptShift, setPromptShift] = useState(0);
  const [recent, setRecent] = useState<{ created: LifeLink[]; updated: LifeLink[] } | null>(null);
  // 天气：按小时缓存在本地，避免每次打开都请求定位 + 天气
  const [weather, setWeather] = useState<(WeatherInfo & { place?: string }) | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem("mydiary.today.weather") || "null");
      return c && Date.now() - c.at < 3600_000 ? c.w : null;
    } catch { return null; }
  });
  const [note, setNote] = useState<string>("");
  // 今日看点：默认开（只露 1 条，点「展开」看 3 条）；用户点过「关闭」就记住
  const [newsOn, setNewsOn] = useState(() => { try { return localStorage.getItem("mydiary.today.news") !== "0"; } catch { return true; } });
  const [news, setNews] = useState<NewsData | null>(null);
  // 频道：记住上次看的；心情不好时自动切到心理 / 好文（下面 effect）
  const [channel, setChannel] = useState<NewsChannel>(() => {
    try { const c = localStorage.getItem("mydiary.today.channel") as NewsChannel | null; return c && c in CHANNEL_META ? c : "news"; } catch { return "news"; }
  });
  const [channels, setChannels] = useState<NewsChannel[]>(["news"]);
  // 频道广场：用户订阅的频道（没设置过 = 全部订阅；后端没有内容的频道自动不显示）
  const [subscribed, setSubscribed] = useState<NewsChannel[] | null>(() => {
    try { const v = JSON.parse(localStorage.getItem("mydiary.today.channels") || "null"); return Array.isArray(v) ? v : null; } catch { return null; }
  });
  const [showPlaza, setShowPlaza] = useState(false);
  const saveSubscribed = (list: NewsChannel[]) => { setSubscribed(list); try { localStorage.setItem("mydiary.today.channels", JSON.stringify(list)); } catch {} };
  // 今天页显示的频道 = 后端可用 ∩ 用户订阅（当前频道即使没订阅也保留，比如心情不好时自动切到心理）
  const shownChannels = channels.filter((c) => !subscribed || subscribed.includes(c) || c === channel);
  const newsCacheRef = useRef<Partial<Record<NewsChannel, NewsData>>>({});
  const [newsOpen, setNewsOpen] = useState(false);   // 只在心情不好时用：点一下才显示
  const [newsPage, setNewsPage] = useState(0);        // 「换一批」翻到第几组
  // 「刷新」按钮已去掉：60s 每天一份，刷新基本不会变；用「换一批」看候选池里的其他新闻
  // 详情弹窗 + 写写看法（列表和弹窗共用）
  const [newsDetailItem, setNewsDetailItem] = useState<NewsItem | null>(null);
  const writeAboutNews = (n: NewsItem, extra?: { points: string[]; question: string }) => {
    const full = n.full || n.title;
    const lines = [`今天看到一条新闻：${full}`];
    if (extra?.points?.length) lines.push(...extra.points.map((p) => `· ${p}`));
    if (n.link) lines.push(`（原文：${n.link}）`);
    lines.push("", extra?.question ? `${extra.question}` : "我的看法：");
    openEditorWith(nav, {
      title: `📰 ${n.title.length > 18 ? n.title.slice(0, 18) + "…" : n.title}`,
      body: lines.join("\n") + (extra?.question ? "\n" : ""),
      tags: ["看点", n.tag || "社会"],
    });
  };
  // 不感兴趣的分类（点「不感兴趣」后这一类不再出现）
  const [hiddenTags, setHiddenTags] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("mydiary.news.hidden") || "[]"); } catch { return []; } });
  const hideTag = (tag: string) => setHiddenTags((list) => {
    const next = list.includes(tag) ? list : [...list, tag];
    try { localStorage.setItem("mydiary.news.hidden", JSON.stringify(next)); } catch {}
    return next;
  });
  // On This Day 那几天的新闻快照
  const [otdNews, setOtdNews] = useState<Record<string, { items: { title: string; tag?: string }[] }>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    cachedGet<any>("milestones:all", listMilestones).then((r) => setMilestones(r?.milestones ?? [])).catch(() => {});
    cachedGet<any>("plans:all", listPlans).then((r) => setPlans(r?.plans ?? [])).catch(() => {});
    lifeRecent(3).then(setRecent).catch(() => {});
    // 新手引导：原来挂在月历首页，首页换成「今天」后搬到这里
    cachedGet<any>("profile", getProfile, { ttl: 0 }).then((p) => {
      const u = p?.user;
      if (!u) return;
      setProfile(u);
      if (u.onboarding_done === 0) setShowOnboarding(true);
      else if (!hasSeenTour()) setShowTour(true);
    }).catch(() => {});
  }, []);

  // 节气 / 节日 / 春节倒计时（本地计算）
  const events = useMemo(() => dayEvents(today, 7), [today]);
  const sfDays = useMemo(() => springFestivalCountdown(today), [today]);

  useEffect(() => {
    if (weather) return;
    let cancelled = false;
    (async () => {
      try {
        const loc = await fetchLocationAuto();
        const w = await fetchWeather(loc.lat, loc.lon);
        if (cancelled || !w) return;
        const v = { ...w, place: loc.source === "default" ? undefined : loc.name };
        setWeather(v);
        try { localStorage.setItem("mydiary.today.weather", JSON.stringify({ at: Date.now(), w: v })); } catch {}
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🌾 小麦的一句话：每天一句，按日期缓存；等天气拿到（或 3 秒没拿到）再请求
  // 过了零点是新的一天要重新生成：生成中 / 失败时先显示本地的一句问候，不让这块空着
  useEffect(() => {
    if (!getToken()) return;
    const key = "mydiary.today.note." + today;
    const cached = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    if (cached) { setNote(cached); return; }
    setNote(localGreeting(new Date().getHours()));
    let cancelled = false;
    const run = (retry: boolean) => {
      const evNames = [...events.today.map((e) => e.name), ...events.upcoming.slice(0, 2).map((e) => `${e.days}天后${e.name}`)];
      dailyNote({ date: today, weather: weather ? { temp: weather.temp, description: weather.description } : null, events: evNames })
        .then((r) => {
          if (cancelled) return;
          if (!r.note) { if (retry) setTimeout(() => !cancelled && run(false), 5000); return; }
          setNote(r.note);
          try { localStorage.setItem(key, r.note); } catch {}
        })
        .catch(() => { if (retry && !cancelled) setTimeout(() => !cancelled && run(false), 5000); });
    };
    const timer = setTimeout(() => run(true), weather ? 0 : 3000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, !!weather]);

  useEffect(() => {
    try { localStorage.setItem("mydiary.today.news", newsOn ? "1" : "0"); } catch {}
    try { localStorage.setItem("mydiary.today.channel", channel); } catch {}
    if (!newsOn) return;
    const c = newsCacheRef.current[channel];
    if (c) { setNews(c); return; }
    setNews(null);
    let cancelled = false;
    listNews(false, channel).then((r) => {
      if (cancelled) return;
      newsCacheRef.current[channel] = r;
      setNews(r);
      if (r.channels?.length) setChannels(r.channels);
    }).catch(() => { if (!cancelled) setNews({ enabled: true, items: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsOn, channel]);

  const tip = weather ? weatherTip(weather.description, weather.temp) : "";

  const todayDiaries = useMemo(
    () => diaries.filter((d) => d.date === today && !(d.capsuleUnlockAt && d.capsuleUnlockAt > Date.now())),
    [diaries, today]
  );
  // 今天解锁的时光胶囊
  const unlockedCapsules = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return diaries.filter((d) => d.capsuleUnlockAt && d.capsuleUnlockAt >= start && d.capsuleUnlockAt <= Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaries, today]);
  const todayPlans = useMemo(
    () => plans.filter((p) => p.target_date === today && p.status !== "completed"),
    [plans, today]
  );
  const soon = useMemo(() => upcomingMilestones(milestones, today), [milestones, today]);

  // 这一周（周一到周日）
  const week = useMemo(() => {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const offset = (base.getDay() + 6) % 7;          // 周一 = 0
    base.setDate(base.getDate() - offset);
    const byDate = new Map<string, Diary[]>();
    for (const d of diaries) {
      if (d.capsuleUnlockAt && d.capsuleUnlockAt > Date.now()) continue;
      const arr = byDate.get(d.date) ?? []; arr.push(d); byDate.set(d.date, arr);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(base); day.setDate(base.getDate() + i);
      const ds = fmtDate(day);
      const list = byDate.get(ds) ?? [];
      const mood = list.map((x) => moodById(x.moodId)).find(Boolean) ?? null;
      return { ds, label: "一二三四五六日"[i], count: list.length, mood, isToday: ds === today, future: ds > today };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaries, today]);
  const weekCount = week.filter((d) => d.count > 0).length;
  // 这一周的一句话：没写 → 引导；写了 → 篇数 + 最常见的心情；还能看上周对比
  const weekSummary = useMemo(() => {
    if (weekCount === 0) {
      const last = diaries.filter((d) => d.date < week[0].ds).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) {
        const gap = daysBetween(last.date, today);
        return gap <= 1 ? "这周还没开始写，从今天开个头吧" : `上一篇是 ${gap} 天前，今天写几句吧`;
      }
      return "这周还没开始写，从今天开个头吧";
    }
    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of week) {
      total += d.count;
      if (d.mood) counts[d.mood.id] = (counts[d.mood.id] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const topMood = top ? MOOD_TAGS.find((m) => m.id === top[0]) : null;
    const passed = week.filter((d) => !d.future).length;
    const base = weekCount === passed ? `这周每天都写了 🎉 共 ${total} 篇` : `这周写了 ${weekCount} 天 · ${total} 篇`;
    return topMood ? `${base}，大多是${topMood.icon} ${topMood.name}` : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, weekCount, diaries, today]);

  const prompt = PROMPTS[(dayHash(today) + promptShift) % PROMPTS.length];

  // 那年今日：卡片放在「回忆」里，今天页只留一行提醒
  // 只算往年（onThisDay 会把今天自己写的也算进去，之前因此出现「0 年前」）
  const otd = useMemo(
    () => onThisDay(diaries).filter((d) => d.date.slice(0, 4) < today.slice(0, 4)).sort((a, b) => b.date.localeCompare(a.date)),
    [diaries, today],
  );
  const otdYearsAgo = otd.length ? Number(today.slice(0, 4)) - Number(otd[0].date.slice(0, 4)) : 0;
  const otdYearCount = new Set(otd.map((d) => d.date.slice(0, 4))).size;

  const isNewUser = diaries.length === 0;

  const hour = now.getHours();
  // ===== 写前 / 写后两种状态 =====
  const written = todayDiaries.length > 0;
  // 今天的心情（取最新一篇有心情的）：心情差时今日看点收起、只挑轻松的
  const todayMood = todayDiaries.map((d) => d.moodId).filter(Boolean).pop() || null;
  const lowMood = todayMood === "sad" || todayMood === "anxious" || todayMood === "angry";
  // 昨天没写 → 给个「补写昨天」入口（保住连续天数）
  const yesterday = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() - 1); return fmtDate(d); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const missedYesterday = !isNewUser && !diaries.some((d) => d.date === yesterday) && diaries.some((d) => d.date < yesterday);
  // 晚上 9 点后还没写：今日一问换成更轻的一句
  const lateNoWrite = !written && hour >= 21;

  // ===== 今日看点：从候选池里按兴趣 / 心情 / 不感兴趣挑 3 条 =====
  const interests: string = profile?.interests || "";
  const newsPicks = useMemo<NewsItem[]>(() => {
    let pool = (news?.items || []).filter((n) => !hiddenTags.includes(n.tag || "社会"));
    if (lowMood) pool = pool.filter((n) => n.light !== false && !["财经", "国际", "社会"].includes(n.tag || ""));
    // 一句话频道不按兴趣排序，保持每天的顺序
    if (channel === "quote") return pool;
    const score = (n: NewsItem) => {
      let s = 0;
      if (interests) {
        const t = (n.full || n.title) + (n.tag || "");
        for (const w of interests.split(/[,，、\s]+/).filter((x) => x.length >= 2)) if (t.includes(w)) s += 2;
        if (n.tag && interests.includes(n.tag)) s += 1;
      }
      if (n.light !== false) s += 0.5;
      return s;
    };
    // 稳定排序：同分保持小麦给的推荐顺序
    return pool.map((n, i) => ({ n, i, s: score(n) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.n);
  }, [news, hiddenTags, lowMood, interests, channel]);
  // 心情不好：今天自动切到「心理」（没有就「好文」/「一句话」），只切一次，用户手动切回来就不管了
  const moodSwitchedRef = useRef(false);
  useEffect(() => {
    if (!lowMood || moodSwitchedRef.current || channel !== "news") return;
    const to = (["psy", "article", "quote"] as NewsChannel[]).find((c) => channels.includes(c));
    if (to) { moodSwitchedRef.current = true; setChannel(to); setNewsPage(0); }
  }, [lowMood, channels, channel]);
  // 每次显示 3 条，「换一批」轮着看候选池里的其他新闻
  const newsPages = Math.max(1, Math.ceil(newsPicks.length / 3));
  const shownNews = newsPicks.slice((newsPage % newsPages) * 3, (newsPage % newsPages) * 3 + 3);
  // 新闻是哪天的（60s 一般上午 10 点左右更新，早上看到的可能是昨天的）
  const newsDateLabel = !news?.date ? "" : news.date === today ? "今天" : news.date === yesterday ? "昨天" : news.date.slice(5).replace("-", "/");

  // On This Day：拉往年那几天的新闻快照（「那天发生了什么」）
  useEffect(() => {
    const dates = Array.from(new Set(otd.map((d) => d.date))).slice(0, 5);
    if (!dates.length || !getToken()) return;
    newsDays(dates).then((r) => setOtdNews(r?.days || {})).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otd.map((d) => d.date).join(",")]);
  const otdHeadline = useMemo(() => {
    for (const d of otd) { const n = otdNews[d.date]?.items?.[0]; if (n?.title) return n.title; }
    return "";
  }, [otd, otdNews]);

  // ===== 小麦少说几句：一页只有一个主发言位 =====
  // 写前：顶部小麦的一句话；写后：顶部不说，只在今天的日记下面回应（今日看点里的点评默认收起，展开才看到）
  const showTopNote = !!note;
  const sky = skyFor(hour, weather?.description);
  const showWriteHint = useHint("today-write");
  const greet = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const name = profile?.nickname ? `，${profile.nickname}` : "";

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      {/* 氛围头图：随时段、天气变化（不吸顶，往下滚就收起来） */}
      <header className={`relative overflow-hidden bg-gradient-to-br ${sky.grad} header-safe`}>
        <Particles kind={sky.weather} />
        <span aria-hidden className={`absolute right-5 top-3 text-5xl opacity-80 ${sky.night ? "" : "drop-shadow-sm"}`}>{sky.deco}</span>
        <div className="relative max-w-xl mx-auto px-4 pt-6 pb-5">
          <p className={`text-xs ${sky.night ? "text-white/80" : "text-paper-ink2"}`}>{greet}{name}</p>
          <h1 className={`text-[30px] font-bold leading-tight tracking-wide ${sky.night ? "text-white" : "text-paper-ink"}`}>
            {now.getMonth() + 1}月{now.getDate()}日
            <span className={`ml-2 text-base font-normal ${sky.night ? "text-white/80" : "text-paper-ink2"}`}>周{WEEK[now.getDay()]}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {weather && (
              <span className={`text-xs px-2.5 py-1 rounded-full backdrop-blur-sm ${sky.night ? "bg-white/15 text-white" : "bg-white/60 text-paper-ink"}`}>
                {weather.icon} {weather.temp}° {weather.description}{weather.place ? ` · ${weather.place}` : ""}
              </span>
            )}
            {streak > 0 && (
              <span className={`text-xs px-2.5 py-1 rounded-full backdrop-blur-sm ${sky.night ? "bg-white/15 text-white" : "bg-white/60 text-orange-700"}`}>
                <span className="flame">🔥</span> 连续 {streak} 天
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {/* 🌾 小麦的一句话 */}
        {showTopNote && (
          <div className="flex items-start gap-2.5">
            <Xiaomai mood={moodFor({ hour, streak })} size={44} className="shrink-0 -mt-1" />
            <div className="flex-1 rounded-2xl rounded-tl-md bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-sm text-paper-ink leading-relaxed shadow-sm animate-pop-in">
              {note}
            </div>
          </div>
        )}

        {/* 节气 / 节日 / 天气提示 / 春节倒计时 */}
        {(events.today.length > 0 || events.upcoming.length > 0 || tip || sfDays) && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {events.today.map((e) => (
              <span key={"t" + e.name} className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-paper-ink text-paper-bg">{e.icon} 今天{e.name}</span>
            ))}
            {events.upcoming.slice(0, 2).map((e) => (
              <span key={"u" + e.name} className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-paper-card border border-paper-line/70 text-paper-ink2">
                {e.icon} {e.days === 1 ? "明天" : `${e.days} 天后`}{e.name}
              </span>
            ))}
            {sfDays && !events.upcoming.some((e) => e.name === "春节") && (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700">🏮 离春节还有 {sfDays} 天</span>
            )}
            {tip && <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-paper-card border border-paper-line/70 text-paper-ink2">{tip}</span>}
          </div>
        )}

        {/* 写入口：最显眼 */}
        <section id="tour-today-write" className="rounded-3xl border border-paper-line/70 shadow-card overflow-hidden bg-gradient-to-br from-[#fffaf0] via-paper-card to-[#fdf3e3]">
          <button type="button" onClick={() => nav("/editor")} className="w-full text-left px-5 pt-5 pb-4 group">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-paper-ink">{todayDiaries.length ? "还想再记点什么？" : "今天想记点什么？"}</div>
                {showWriteHint && <div className="text-xs text-paper-ink2 mt-1">写几句，或者点底部 🎙️ 说给小麦听</div>}
              </div>
              <span className="shrink-0 w-11 h-11 rounded-full bg-paper-accent text-white flex items-center justify-center text-xl shadow-md group-hover:scale-105 group-active:scale-95 transition">✏️</span>
            </div>
          </button>
          {/* 一键记心情：点一下直接带着心情开始写 */}
          <div className="px-5 pb-4 pt-3 border-t border-paper-line/50 bg-paper-card/60">
            <div className="text-[11px] text-paper-ink2 mb-2">此刻的心情</div>
            <div className="grid grid-cols-5 gap-2">
              {MOOD_TAGS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openEditorWith(nav, { moodId: m.id })}
                  className="tap-bounce flex flex-col items-center gap-1 py-2 rounded-2xl hover:bg-paper-surface transition"
                >
                  <span className="w-10 h-10 rounded-full flex items-center justify-center text-2xl" style={{ background: m.color + "33" }}>{m.icon}</span>
                  <span className="text-[11px] text-paper-ink2">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 今日一问（晚上 9 点后还没写，换成「睡前一句」） */}
        <section className="card px-5 py-4 relative overflow-hidden">
          <span aria-hidden className="absolute -right-2 -top-6 text-[88px] leading-none text-paper-line/60 select-none">“</span>
          <div className="relative flex items-center justify-between">
            <span className="section-label">{lateNoWrite ? "🌙 睡前一句" : "💭 今日一问"}</span>
            <button type="button" onClick={() => setPromptShift((x) => x + 1)} className="text-[11px] px-2 py-0.5 rounded-full border border-paper-line/70 text-paper-ink2 hover:text-paper-ink hover:bg-paper-surface">🔄 换一个</button>
          </div>
          <button type="button" onClick={() => openEditorWith(nav, { prompt: lateNoWrite ? "今天过得怎么样？" : prompt })} className="relative w-full text-left mt-2">
            <div className="text-[17px] text-paper-ink leading-relaxed border-l-[3px] border-paper-accent/50 pl-3">{lateNoWrite ? "今天过得怎么样？一句话也行，明天的你会想看到的。" : prompt}</div>
            <div className="text-xs text-paper-accent mt-3 font-medium">用这个开始写 ›</div>
          </button>
        </section>

        {/* 今天的日记 + 小麦的回应 */}
        {todayDiaries.map((d) => {
          const mood = moodById(d.moodId);
          const tpl = templateById(d.templateId || "diary");
          const preview = firstText(d);
          return (
            <div key={d.id} className="card px-4 py-3">
              <button type="button" onClick={() => nav(`/editor/${d.id}`)} className="w-full text-left">
                {firstImage(d) && <img src={firstImage(d)!} alt="" className="mb-2 w-full h-40 object-cover rounded-xl" loading="lazy" />}
                <div className="flex items-center gap-2 text-xs text-paper-ink2">
                  {mood && <span className="text-base">{mood.icon}</span>}
                  {tpl && <span>{tpl.name}</span>}
                </div>
                {d.title && <div className="font-medium text-paper-ink mt-0.5 truncate">{d.title}</div>}
                {preview && <p className="text-sm text-paper-ink2 mt-1 line-clamp-2">{preview}</p>}
              </button>
              <XiaomaiReply diary={d} />
              <LifeLinks diaryId={d.id} prefix="这篇提到了" className="mt-2" />
            </div>
          );
        })}

        {/* 昨天没写：补写入口（日期自动设成昨天） */}
        {missedYesterday && (
          <button type="button" onClick={() => nav(`/editor?date=${yesterday}`)}
            className="w-full px-4 py-2.5 flex items-center gap-3 rounded-2xl border border-dashed border-paper-line text-left text-sm text-paper-ink2 hover:bg-paper-surface transition">
            <span className="text-lg shrink-0">🗓️</span>
            <span className="flex-1 min-w-0">昨天忘了写？现在补几句也来得及</span>
            <span className="shrink-0 text-xs text-paper-accent">补写昨天 ›</span>
          </button>
        )}

        {/* 今天解锁的时光胶囊 */}
        {unlockedCapsules.length > 0 && (
          <section className="card px-4 py-3">
            <div className="text-sm font-medium text-paper-ink mb-2">🫧 有 {unlockedCapsules.length} 个时光胶囊今天解锁了</div>
            {unlockedCapsules.map((d) => (
              <button key={d.id} type="button" onClick={() => nav(`/editor/${d.id}`)}
                className="w-full text-left text-sm text-paper-ink2 py-1 hover:text-paper-ink">
                📮 {d.date} 写给今天的你{d.title ? `：${d.title}` : ""} ›
              </button>
            ))}
          </section>
        )}

        {/* 今天到期的计划 */}
        {todayPlans.length > 0 && (
          <section className="card px-4 py-3">
            <div className="section-label mb-2">🎯 今天要做</div>
            {todayPlans.map((p) => (
              <div key={p.id} className="text-sm text-paper-ink2 py-0.5">{p.icon || "•"} {p.title}</div>
            ))}
          </section>
        )}

        {/* 近期纪念日 / 倒计时 */}
        {soon.length > 0 && (
          <section className="card px-4 py-3">
            <div className="section-label mb-2">🎈 快到了</div>
            {soon.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm py-0.5">
                <span className="text-paper-ink truncate">{m.icon} {m.title}</span>
                <span className="shrink-0 text-xs text-paper-ink2 ml-2">{m.text}</span>
              </div>
            ))}
          </section>
        )}

        {/* On This Day：一行提醒（标题 + 最近那篇的一句话），点了去「回忆」月历看这一天 */}
        {otd.length > 0 && (
          <button type="button" onClick={() => nav(`/calendar?date=${today}`)}
            className="w-full card px-4 py-3 flex items-center gap-3 text-left hover:shadow-cardHover transition">
            <span className="text-xl shrink-0">🎞️</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-paper-ink">On This Day</span>
                <span className="text-[11px] text-paper-ink2 truncate">
                  {otdYearCount > 1
                    ? `${otdYearCount} 个往年的今天 · ${otd.length} 篇`
                    : `${otdYearsAgo === 1 ? "去年" : otdYearsAgo === 2 ? "前年" : otdYearsAgo + " 年前"}的今天${otd.length > 1 ? ` · ${otd.length} 篇` : ""}`}
                </span>
              </span>
              <span className="block text-xs text-paper-ink2 mt-0.5 truncate">
                {moodById(otd[0].moodId)?.icon ? moodById(otd[0].moodId)!.icon + " " : ""}
                {otd[0].title || firstText(otd[0]) || "那天你写了一篇日记"}
              </span>
              {otdHeadline && <span className="block text-[11px] text-paper-ink3 mt-0.5 truncate">📰 那天的新闻：{otdHeadline}</span>}
            </span>
            <span className="text-paper-ink3 shrink-0">›</span>
          </button>
        )}

        {/* 还没有往年日记：告诉用户明年会发生什么（今天写没写都显示，文案不同） */}
        {otd.length === 0 && (
          <div className="w-full px-4 py-2.5 flex items-center gap-3 rounded-2xl border border-dashed border-paper-line text-xs text-paper-ink3">
            <span className="text-lg shrink-0 opacity-70">🎞️</span>
            <span className="min-w-0"><span className="font-medium text-paper-ink2">On This Day</span> · {written
              ? "明年的今天，小麦会把今天的日记翻出来给你看 🌾"
              : "今天写下的日记，明年的今天小麦会翻出来给你看 🌾"}</span>
          </div>
        )}

        {/* 这一周：日期 + 心情；下面一句总结，没写的时候给个引导 */}
        {!isNewUser && (
          <section className="card px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">📅 这一周</span>
              <button type="button" onClick={() => nav("/calendar")} className="text-[11px] text-paper-ink3 hover:text-paper-ink">月历 ›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((d) => {
                const dayNum = Number(d.ds.slice(8));
                const written = d.count > 0;
                return (
                  <button
                    key={d.ds}
                    type="button"
                    disabled={d.future}
                    onClick={() => (written ? nav(`/calendar?date=${d.ds}`) : nav("/editor"))}
                    className={`flex flex-col items-center gap-1 py-1 rounded-xl outline-none transition ${d.future ? "opacity-30" : "hover:bg-paper-surface"}`}
                  >
                    <span className={`text-[10px] ${d.isToday ? "text-paper-accent font-medium" : "text-paper-ink3"}`}>{d.isToday ? "今天" : d.label}</span>
                    <span
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                        d.isToday && !written ? "ring-2 ring-paper-accent/50 ring-offset-2 ring-offset-paper-card" : ""
                      }`}
                      style={{ background: written ? (d.mood ? d.mood.color + "55" : "rgba(139,111,71,0.15)") : "var(--paper-surface)" }}
                    >
                      {written
                        ? <span className="text-lg leading-none">{d.mood ? d.mood.icon : "✏️"}</span>
                        : <span className={`text-sm ${d.isToday ? "text-paper-ink font-medium" : "text-paper-ink3"}`}>{dayNum}</span>}
                    </span>
                    {d.count > 1 && <span className="text-[9px] text-paper-ink3 leading-none">×{d.count}</span>}
                  </button>
                );
              })}
            </div>
            {/* 一句话总结 */}
            <div className="mt-3 pt-3 border-t border-paper-line/50 flex items-center justify-between gap-2">
              <span className="text-xs text-paper-ink2 min-w-0 truncate">{weekSummary}</span>
              {!todayDiaries.length && (
                <button type="button" onClick={() => nav("/editor")}
                  className="shrink-0 text-xs px-3 py-1 rounded-full bg-paper-accent text-white hover:opacity-90 active:scale-95 transition">
                  写今天
                </button>
              )}
            </div>
          </section>
        )}

        {/* 🌾 小麦最近整理了：让用户看到知识库在长 */}
        {recent && (recent.created.length > 0 || recent.updated.length > 0) && (
          <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-paper-card border border-amber-100 shadow-card px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">🌾 小麦最近整理了</span>
              <button type="button" onClick={() => nav("/people")} className="text-[11px] text-paper-ink3 hover:text-paper-ink">去看看 ›</button>
            </div>
            {recent.created.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="text-xs text-paper-ink2">新认识了</span>
                {recent.created.map((l) => (
                  <button key={l.id} type="button" onClick={() => nav("/people/" + l.id)}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-paper-card border border-amber-200 text-paper-ink hover:bg-amber-50">
                    {l.kind === "person" ? "👤" : l.kind === "place" ? "📍" : "✨"} {l.title}
                  </button>
                ))}
              </div>
            )}
            {recent.updated.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-paper-ink2">又多了解了</span>
                {recent.updated.map((l) => (
                  <button key={l.id} type="button" onClick={() => nav("/people/" + l.id)}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-paper-card border border-paper-line/70 text-paper-ink2 hover:text-paper-ink">
                    {l.title}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 📰 今日看点：默认 3 条，「换一批」看别的；按兴趣 / 心情 / 不感兴趣挑；心情不好时默认收起 */}
        {newsOn && !isNewUser && (lowMood && channel === "news" && !newsOpen ? (
          <button type="button" onClick={() => setNewsOpen(true)} className="w-full text-center text-xs text-paper-ink3 hover:text-paper-ink py-1">
            📰 今天先不看新闻也没关系 · 想看点一下
          </button>
        ) : (
          <section className="card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="section-label shrink-0">{CHANNEL_META[channel].icon} {CHANNEL_META[channel].label}</span>
              {channel === "news" && newsDateLabel && <span className="text-[10px] text-paper-ink3">{newsDateLabel}{news?.updated ? ` ${news.updated.slice(11, 16)}` : ""} 更新</span>}
              <span className="flex-1" />
              <button type="button" onClick={() => setShowPlaza(true)} title="频道广场：选你想看的频道"
                className="shrink-0 text-xs text-paper-ink3 hover:text-paper-ink">⚙️ 频道</button>
              <button type="button" onClick={() => setNewsOn(false)} className="shrink-0 text-xs text-paper-ink3 hover:text-paper-ink">关闭</button>
            </div>
            {/* 频道切换：只显示后端有内容、并且用户订阅了的频道 */}
            {shownChannels.length > 1 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                {shownChannels.map((c) => (
                  <button key={c} type="button" onClick={() => { setChannel(c); setNewsPage(0); }}
                    className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition ${c === channel ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70 hover:text-paper-ink"}`}>
                    {CHANNEL_META[c].icon} {CHANNEL_META[c].name}
                  </button>
                ))}
              </div>
            )}
            {channel === "news" && news?.tip ? <div className="mt-1 text-xs text-paper-ink2 leading-relaxed">💭 {news.tip}</div> : null}
            <div className="mt-2">
            {!news ? (
              <div className="text-xs text-paper-ink2 animate-pulse">加载中…</div>
            ) : !news.enabled ? (
              <div className="text-xs text-paper-ink2">{channel === "news" ? "新闻功能还没开放，敬请期待～" : "这个频道还在准备中～"}</div>
            ) : newsPicks.length === 0 ? (
              <div className="text-xs text-paper-ink2">{hiddenTags.length ? "你关心的分类今天没有新内容" : "暂时没有新内容"}</div>
            ) : (
              <ul className="divide-y divide-paper-line/50">
                {shownNews.map((n) => {
                  const tag = NEWS_TAG_STYLE[n.tag || ""] || NEWS_TAG_STYLE["社会"];
                  const full = n.full || n.title;
                  // 🌙 一句话：大字引用 + 出处，点「用这句开始写」当成今天的写作引子
                  if (channel === "quote") return (
                    <li key={n.title} className="py-3 first:pt-1 last:pb-1">
                      <p className="text-[15px] text-paper-ink leading-relaxed border-l-[3px] border-indigo-200 pl-3">{n.title}</p>
                      <div className="mt-1.5 flex items-center gap-3 pl-3.5">
                        <span className="flex-1 min-w-0 text-[11px] text-paper-ink3 truncate">—— {n.source}</span>
                        <button type="button" onClick={() => openEditorWith(nav, { body: `「${n.title}」——${n.source}\n\n读到这句，我想到：`, tags: ["一句话"] })}
                          className="shrink-0 text-[11px] text-paper-accent hover:underline">✍️ 用这句开始写</button>
                      </div>
                    </li>
                  );
                  return (
                    <li key={n.link || n.title} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${tag.cls}`}>{tag.icon} {n.tag || "社会"}</span>
                        {/* 点标题：弹出详情（小麦划重点 / 和你有什么关系 / 看原文） */}
                        <button type="button" onClick={() => setNewsDetailItem(n)} title={full}
                          className="flex-1 min-w-0 text-left line-clamp-2 text-sm leading-snug text-paper-ink hover:text-paper-accent">
                          {n.title}
                          {n.summary ? <span className="ml-1 text-[11px] text-paper-ink3">›</span> : null}
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-3 pl-0.5">
                        {n.say ? <span className="flex-1 min-w-0 text-xs text-paper-ink2 truncate">🌾 {n.say}</span> : <span className="flex-1" />}
                        {(
                          <button type="button" onClick={() => { hideTag(n.tag || "社会"); toast(`以后少给你看「${n.tag || "社会"}」类内容`, "ok"); }}
                            className="shrink-0 text-[11px] text-paper-ink3 hover:text-paper-ink">不感兴趣</button>
                        )}
                        <button type="button" onClick={() => writeAboutNews(n)}
                          className="shrink-0 text-[11px] text-paper-accent hover:underline">💬 写写看法</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
            {news?.enabled && (newsPicks.length > 3 || hiddenTags.length > 0) && (
              <div className="mt-2 pt-2 border-t border-paper-line/50 flex items-center justify-between text-[11px] text-paper-ink3">
                {hiddenTags.length > 0
                  ? <button type="button" onClick={() => { setHiddenTags([]); try { localStorage.removeItem("mydiary.news.hidden"); } catch {} }} className="hover:text-paper-ink truncate">已隐藏：{hiddenTags.join("、")} · 恢复</button>
                  : <span>{newsPicks.length > 3 ? `第 ${(newsPage % newsPages) + 1}/${newsPages} 组 · 共 ${newsPicks.length} 条` : ""}</span>}
                <span className="flex items-center gap-3 shrink-0">
                  {newsPicks.length > 3 && (
                    <button type="button" onClick={() => setNewsPage((p) => p + 1)} className="hover:text-paper-ink">🔄 换一批</button>
                  )}
                </span>
              </div>
            )}
          </section>
        ))}
        {!newsOn && !isNewUser && (
          <button type="button" onClick={() => setNewsOn(true)} className="w-full text-center text-xs text-paper-ink3 hover:text-paper-ink py-1">
            ＋ 在这里显示每日看点
          </button>
        )}

        {/* 新用户：告诉 TA 写下去会得到什么 */}
        {isNewUser ? (
          <section className="card px-4 py-4">
            <div className="flex items-center gap-3 mb-2">
              <Xiaomai mood="cheer" size={52} />
              <div className="text-base font-semibold text-paper-ink">你好，我是小麦</div>
            </div>
            <ul className="space-y-1.5 text-sm text-paper-ink2">
              <li>✍️ 写下今天，我会回你一句话</li>
              <li>👤 写得多了，我会记住你生活里的人和地方</li>
              <li>💬 想不起哪天发生了什么，随时问我</li>
            </ul>
          </section>
        ) : (
          <button type="button" onClick={() => nav("/xiaomai")} className="w-full card px-4 py-3 text-left hover:border-paper-accent/40 transition">
            <div className="flex items-center gap-3">
              <Xiaomai mood="happy" size={40} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-paper-ink">想不起哪天的事？问问小麦</div>
                <div className="text-xs text-paper-ink2 mt-0.5 truncate">"这个月我心情怎么样？""上次见爸妈是什么时候？"</div>
              </div>
              <span className="shrink-0 text-paper-ink3">›</span>
            </div>
          </button>
        )}

      </main>

      <BottomDock active="home" />

      {/* 频道广场：勾选想在今天页看到的频道（存在本机） */}
      <Modal open={showPlaza} onClose={() => setShowPlaza(false)} size="sm" title="频道广场">
        <div className="px-5 pt-3 pb-5">
          <p className="text-xs text-paper-ink2 mb-3">选你想在「今天」看到的频道，至少留一个。</p>
          <ul className="space-y-2">
            {ALL_CHANNELS.map((c) => {
              const on = !subscribed || subscribed.includes(c);
              const ready = channels.includes(c);
              return (
                <li key={c}>
                  <button type="button" disabled={!ready}
                    onClick={() => {
                      const cur = subscribed ?? ALL_CHANNELS;
                      const next = on ? cur.filter((x) => x !== c) : [...cur, c];
                      if (!next.length) { toast("至少留一个频道吧", "error"); return; }
                      saveSubscribed(next);
                      if (on && c === channel) setChannel(next.find((x) => channels.includes(x)) || "news");
                    }}
                    className={`w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-2xl border transition disabled:opacity-50 ${on && ready ? "border-paper-accent/40 bg-amber-50/50" : "border-paper-line/70 bg-paper-card hover:bg-paper-surface"}`}>
                    <span className="text-xl shrink-0">{CHANNEL_META[c].icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-paper-ink">{CHANNEL_META[c].name}{!ready && <span className="ml-1.5 text-[10px] text-paper-ink3">准备中</span>}</span>
                      <span className="block text-xs text-paper-ink2 mt-0.5 leading-relaxed">{CHANNEL_META[c].desc}</span>
                    </span>
                    <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${on && ready ? "bg-paper-accent border-paper-accent text-white" : "border-paper-line"}`}>{on && ready ? "✓" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-paper-ink3">更多频道陆续上线中 🌾</p>
        </div>
      </Modal>

      <NewsDetailSheet
        item={newsDetailItem}
        open={!!newsDetailItem}
        onClose={() => setNewsDetailItem(null)}
        onWrite={(n, extra) => { setNewsDetailItem(null); writeAboutNews(n, extra); }}
      />

      {showOnboarding && (
        <OnboardingWizard
          nickname={profile?.nickname}
          onComplete={() => { setShowOnboarding(false); setShowTour(true); }}
          onSkip={() => { setShowOnboarding(false); if (!hasSeenTour()) setShowTour(true); }}
        />
      )}
      {showTour && (
        <FeatureTour
          open={showTour}
          steps={TODAY_TOUR}
          onFinish={() => { markTourSeen(); setShowTour(false); }}
          onSkip={() => { markTourSeen(); setShowTour(false); }}
        />
      )}
    </div>
  );
}

const TODAY_TOUR: TourStep[] = [
  { selector: "#tour-today-write", title: "✍️ 写日记", description: "点这里写今天的日记。写完回来，小麦会回你一句话～" },
  { selector: "#tour-dock-voice", title: "🎤 语音快记", description: "不想打字？对着麦克风说几句，小麦帮你整理成日记。" },
  { selector: "#tour-dock-memories", title: "🕰️ 回忆", description: "写过的日记都在这里：时间线、月历、小麦认识的人，还有书柜。" },
  { selector: "#tour-dock-xiaomai", title: "🌾 小麦", description: "想不起哪天发生了什么？问小麦，它读过你所有的日记。" },
  { selector: "#tour-dock-profile", title: "👤 我的", description: "头像、主题、提醒和数据都在这里。新手指引也能在这里重看。" },
];
