import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { computeStreak, fmtDate, moodById, MOOD_TAGS, PROMPTS, onThisDay } from "../data";
import { templateById } from "../templates";
import { getProfile, listMilestones, listPlans, diaryReply, dailyNote, listNews, getToken, lifeOverview, lifeRecent, type Milestone, type Plan, type LifeItem, type LifeLink, type NewsData } from "../api";
import { fetchLocationAuto, fetchWeather } from "../weather";
import { dayEvents, springFestivalCountdown, weatherTip } from "../today";
import type { WeatherInfo } from "../types";
import { cachedGet, peek } from "../dataCache";
import LifeLinks from "./LifeLinks";
import Xiaomai, { moodFor } from "./Xiaomai";
import { useHint } from "./useOnce";
import BottomDock from "./BottomDock";
import OnboardingWizard from "./OnboardingWizard";
import FeatureTour, { hasSeenTour, markTourSeen, type TourStep } from "./FeatureTour";

// ☀️ 今天（新首页，信息架构改版阶段 2，见 docs/ia-redesign.md）
// 原则：只放和"今天"有关的东西；没有内容的卡片不显示 —— 新用户看到的只有写入口
interface Props { diaries: Diary[] }

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

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
const NEWS_TAG_STYLE: Record<string, { icon: string; cls: string }> = {
  生活: { icon: "🏠", cls: "bg-amber-50 text-amber-800" },
  科技: { icon: "🚀", cls: "bg-sky-50 text-sky-700" },
  国际: { icon: "🌏", cls: "bg-indigo-50 text-indigo-700" },
  财经: { icon: "💰", cls: "bg-emerald-50 text-emerald-700" },
  社会: { icon: "📌", cls: "bg-stone-100 text-stone-700" },
  体育: { icon: "⚽", cls: "bg-orange-50 text-orange-700" },
  文娱: { icon: "🎬", cls: "bg-pink-50 text-pink-700" },
  健康: { icon: "🍎", cls: "bg-rose-50 text-rose-700" },
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
function openEditorWith(nav: (p: string) => void, opts: { prompt?: string; moodId?: string }) {
  const rid = () => "t" + Math.random().toString(36).slice(2, 10);
  const blocks: any[] = [];
  if (opts.prompt) blocks.push({ id: rid(), kind: "quote", content: opts.prompt });
  blocks.push({ id: rid(), kind: "text", content: "" });
  try {
    sessionStorage.setItem("mydiary.quickentry", JSON.stringify({
      templateId: "diary", ts: Date.now(),
      polished: { title: "", blocks, mood: opts.moodId, tags: [] },
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
  const [people, setPeople] = useState<LifeItem[]>(() => peek<any>("life:overview")?.items ?? []);
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
  // 新闻：默认关闭，用户自己打开
  const [newsOn, setNewsOn] = useState(() => { try { return localStorage.getItem("mydiary.today.news") === "1"; } catch { return false; } });
  const [news, setNews] = useState<NewsData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    cachedGet<any>("milestones:all", listMilestones).then((r) => setMilestones(r?.milestones ?? [])).catch(() => {});
    cachedGet<any>("plans:all", listPlans).then((r) => setPlans(r?.plans ?? [])).catch(() => {});
    // 小麦认识的人（后端没部署人物接口时静默失败，不显示这张卡）
    cachedGet<any>("life:overview", lifeOverview).then((r) => setPeople(r?.items ?? [])).catch(() => {});
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
  useEffect(() => {
    if (!getToken()) return;
    const key = "mydiary.today.note." + today;
    const cached = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    if (cached) { setNote(cached); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      const evNames = [...events.today.map((e) => e.name), ...events.upcoming.slice(0, 2).map((e) => `${e.days}天后${e.name}`)];
      dailyNote({ date: today, weather: weather ? { temp: weather.temp, description: weather.description } : null, events: evNames })
        .then((r) => {
          if (cancelled || !r.note) return;
          setNote(r.note);
          try { localStorage.setItem(key, r.note); } catch {}
        })
        .catch(() => {});
    }, weather ? 0 : 3000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, !!weather]);

  useEffect(() => {
    try { localStorage.setItem("mydiary.today.news", newsOn ? "1" : "0"); } catch {}
    if (!newsOn || news) return;
    listNews().then(setNews).catch(() => setNews({ enabled: true, items: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsOn]);

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

  const topPeople = useMemo(() => people.filter((p) => p.kind === "person").slice(0, 6), [people]);
  const isNewUser = diaries.length === 0;

  const hour = now.getHours();
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
        {note && (
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

        {/* 今日一问：不知道写什么的时候给个引子 */}
        <section className="card px-5 py-4 relative overflow-hidden">
          <span aria-hidden className="absolute -right-2 -top-6 text-[88px] leading-none text-paper-line/60 select-none">“</span>
          <div className="relative flex items-center justify-between">
            <span className="section-label">💭 今日一问</span>
            <button type="button" onClick={() => setPromptShift((x) => x + 1)} className="text-[11px] px-2 py-0.5 rounded-full border border-paper-line/70 text-paper-ink2 hover:text-paper-ink hover:bg-paper-surface">🔄 换一个</button>
          </div>
          <button type="button" onClick={() => openEditorWith(nav, { prompt })} className="relative w-full text-left mt-2">
            <div className="text-[17px] text-paper-ink leading-relaxed border-l-[3px] border-paper-accent/50 pl-3">{prompt}</div>
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
            </span>
            <span className="text-paper-ink3 shrink-0">›</span>
          </button>
        )}
        {/* 还没有往年日记：告诉用户明年会发生什么（已写今天的才提示，新用户先不打扰） */}
        {otd.length === 0 && diaries.some((d) => d.date === today) && (
          <div className="w-full px-4 py-2.5 flex items-center gap-3 rounded-2xl border border-dashed border-paper-line text-xs text-paper-ink3">
            <span className="text-lg shrink-0 opacity-70">🎞️</span>
            <span className="min-w-0"><span className="font-medium text-paper-ink2">On This Day</span> · 明年的今天，小麦会把今天的日记翻出来给你看 🌾</span>
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

        {/* 小麦认识的人 */}
        {topPeople.length > 0 && (
          <section className="card px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">👤 小麦认识的人</span>
              <button type="button" onClick={() => nav("/people")} className="text-xs text-paper-ink3 hover:text-paper-ink">全部 ›</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {topPeople.map((p) => (
                <button key={p.id} type="button" onClick={() => nav(`/people/${p.id}`)}
                  className="flex items-center gap-1.5 text-sm pl-1 pr-3 py-1 rounded-full bg-paper-surface border border-paper-line/70 hover:bg-paper-line/40">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-300 flex items-center justify-center text-xs text-paper-ink">{p.title.slice(0, 1)}</span>
                  {p.title}{p.mentions > 1 ? <span className="text-[11px] text-paper-ink2">×{p.mentions}</span> : null}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 📰 新闻：默认关闭；打开后每天看几条标题，也可以拿来当写作引子 */}
        {newsOn ? (
          <section className="card px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="section-label shrink-0">📰 今日看点</span>
              <span className="flex-1" />
              <button type="button" onClick={() => setNewsOn(false)} className="shrink-0 text-xs text-paper-ink3 hover:text-paper-ink">关闭</button>
            </div>
            {/* 每日微语放顶上、单独一行完整显示，当成今天想说的话 */}
            {news?.tip ? <div className="mt-1 mb-2 text-xs text-paper-ink2 leading-relaxed">💭 {news.tip}</div> : <div className="mb-2" />}
            {!news ? (
              <div className="text-xs text-paper-ink2 animate-pulse">加载中…</div>
            ) : !news.enabled ? (
              <div className="text-xs text-paper-ink2">新闻功能还没开放，敬请期待～</div>
            ) : news.items.length === 0 ? (
              <div className="text-xs text-paper-ink2">暂时没有新内容</div>
            ) : (
              <ul className="divide-y divide-paper-line/50">
                {news.items.slice(0, 3).map((n) => {
                  const tag = NEWS_TAG_STYLE[n.tag || ""] || NEWS_TAG_STYLE["社会"];
                  const title = n.link
                    ? <a href={n.link} target="_blank" rel="noopener noreferrer" title={n.full || n.title} className="hover:underline">{n.title}</a>
                    : <span title={n.full || n.title}>{n.title}</span>;
                  return (
                    <li key={n.link || n.title} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${tag.cls}`}>{tag.icon} {n.tag || "社会"}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-paper-ink">{title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-0.5">
                        {n.say
                          ? <span className="flex-1 min-w-0 text-xs text-paper-ink2 truncate">🌾 {n.say}</span>
                          : <span className="flex-1" />}
                        <button type="button" onClick={() => openEditorWith(nav, { prompt: `今天看到：${n.full || n.title}。我的想法是……` })}
                          className="shrink-0 text-[11px] text-paper-accent hover:underline">💬 写写看法</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
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
