import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { getProfile, listPlans, listMilestones } from "../api";
import { cachedGet, peek } from "../dataCache";
import { monthCells, moodById, fmtDate } from "../data";
import { TEMPLATES } from "../templates";
import OnThisDay from "./OnThisDay";
import MoodHeatmap from "./MoodHeatmap";
import DayList from "./DayList";
import BottomDock from "./BottomDock";
import { MemoriesHeader } from "./MemoriesSwitch";
import OnboardingWizard from "./OnboardingWizard";
import FeatureTour, { hasSeenTour, markTourSeen, type TourStep } from "./FeatureTour";

interface Props {
  diaries: Diary[];
  onSoftDelete?: (id: string) => void;
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage({ diaries, onSoftDelete }: Props) {
  const nav = useNavigate();
  const now = new Date();
  // 支持 ?date=YYYY-MM-DD 深链进入（年度回顾月块下钻）
  const initialDate = (() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("date");
    return (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : fmtDate(now);
  })();
  const [year, setYear] = useState(Number(initialDate.slice(0, 4)));
  const [month, setMonth] = useState(Number(initialDate.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const [showDayDetail, setShowDayDetail] = useState<string | null>(null);
  // 🔑 首帧优先用缓存：进过一次之后，再回到这个页面不再出现整屏「正在加载…」
  const [avatarKey, setAvatarKey] = useState<string | null>(
    () => peek<any>("profile")?.user?.avatar ?? null
  );
  const [userProfile, setUserProfile] = useState<any>(
    () => peek<any>("profile")?.user ?? null
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [bootLoading, setBootLoading] = useState(() => peek("profile") === undefined);
  const [plansByDate, setPlansByDate] = useState<Map<string, number>>(new Map());
  const [milestonesByDate, setMilestonesByDate] = useState<Map<string, number>>(new Map());

  // 并行拉 plans + milestones，按 target_date 分组
  useEffect(() => {
    Promise.all([
      // 日历上的计划/里程碑圆点：缓存 60s，切回来不再重复拉
      cachedGet("plans:all", listPlans).catch(() => null),
      cachedGet("milestones:all", listMilestones).catch(() => null),
    ]).then(([p, m]) => {
      const pMap = new Map<string, number>();
      const mMap = new Map<string, number>();
      for (const pl of (p as any)?.plans ?? []) {
        if (pl.target_date && pl.status !== "completed") pMap.set(pl.target_date, (pMap.get(pl.target_date) ?? 0) + 1);
      }
      for (const ms of (m as any)?.milestones ?? []) {
        if (ms.target_date) mMap.set(ms.target_date, (mMap.get(ms.target_date) ?? 0) + 1);
      }
      setPlansByDate(pMap);
      setMilestonesByDate(mMap);
    });
  }, []);

  // 拉用户信息，判断是否需要新手指引
  useEffect(() => {
    // ttl: 0 —— 缓存只用于"先上屏"，每次进入仍拉一次最新资料（达人/统计要准）
    cachedGet<any>("profile", getProfile, { ttl: 0 }).then((p: any) => {
      const u = p?.user;
      if (!u) return;
      setUserProfile(u);
      setAvatarKey(u.avatar || null);
      // 新手引导已搬到「今天」页（TodayPage）——月历不再是首页，这里不再弹
    }).catch(() => {}).finally(() => setBootLoading(false));
  }, []);


  const cells = useMemo(() => monthCells(year, month), [year, month]);

  // 按 date 索引日记
  const byDate = useMemo(() => {
    const m = new Map<string, Diary[]>();
    for (const d of diaries) {
      // 不再跳过 capsule 日记 —— 它们需要显示出来（加锁图标）
      const arr = m.get(d.date) ?? [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return m;
  }, [diaries]);

  // 仅统计已解锁日记的心情（被 capsule 锁的不影响心情图）
  const moodByDate = useMemo(() => {
    const m = new Map<string, { moodId: string; count: number }>();
    for (const d of diaries) {
      if (d.capsuleUnlockAt && d.capsuleUnlockAt > Date.now()) continue;
      const prev = m.get(d.date);
      if (prev) {
        m.set(d.date, { moodId: d.moodId ?? prev.moodId, count: prev.count + 1 });
      } else {
        m.set(d.date, { moodId: d.moodId ?? "", count: 1 });
      }
    }
    return m;
  }, [diaries]);

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const todayStr = fmtDate(now);

  // 启动中：等 getProfile 返回再渲染主界面（避免先闪主界面再弹问卷）
  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf6ef]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-paper-line border-amber-700/50 border-t-amber-700 rounded-full animate-spin" />
          <p className="text-paper-ink3 text-sm">正在加载…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      <MemoriesHeader current="calendar" subtitle={`共 ${diaries.length} 篇日记`} />

      <main className="max-w-2xl mx-auto px-4 pt-3 space-y-4">
          {/* 视图切换 — 手机横向可滚，PC 正常 */}
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <div id="tour-tabs" className="flex items-center gap-1.5">
              <button
                id="tour-tab-monthly"
                onClick={() => setView("monthly")}
              className={`shrink-0 h-7 px-3 rounded-full text-xs border transition ${
                view === "monthly"
                  ? "bg-paper-ink text-paper-bg border-paper-ink"
                  : "bg-paper-card text-paper-ink2 border-paper-line/70"
              }`}
            >
              📅 按月
            </button>
            <button
              id="tour-tab-yearly"
              onClick={() => setView("yearly")}
              className={`shrink-0 h-7 px-3 rounded-full text-xs border transition ${
                view === "yearly"
                  ? "bg-paper-ink text-paper-bg border-paper-ink"
                  : "bg-paper-card text-paper-ink2 border-paper-line/70"
              }`}
            >
              📊 按年
            </button>
          </div>
        </div>

        {view === "monthly" ? (
          <>
        {/* 月历卡片 */}
        <section className="rounded-3xl bg-paper-card border border-paper-line/70 shadow-card p-4 md:p-6 animate-fade-up">
          {/* 月份切换 */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={goPrev} className="btn-ghost w-9 h-9 p-0 flex items-center justify-center text-lg">‹</button>
            <h1 className="text-xl md:text-2xl font-semibold text-paper-ink tracking-wide">
              {year} 年 {month + 1} 月
            </h1>
            <button onClick={goNext} className="btn-ghost w-9 h-9 p-0 flex items-center justify-center text-lg">›</button>
          </div>

          {/* 星期 */}
          <div className="grid grid-cols-7 mb-2">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="text-center text-xs md:text-sm text-paper-ink2/70 font-medium py-1">
                {w}
              </div>
            ))}
          </div>

          {/* 42 格 */}
           <div id="tour-month-grid" className="grid grid-cols-7 gap-1 md:gap-2">
            {cells.map((d, i) => {
              const ds = fmtDate(d);
              const inMonth = d.getMonth() === month;
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              const moodInfo = moodByDate.get(ds);
              const mood = moodInfo?.moodId ? moodById(moodInfo.moodId) : null;
              const dayDiaries = byDate.get(ds) ?? [];
              const capsuleCount = dayDiaries.filter(
                (x) => x.capsuleUnlockAt && x.capsuleUnlockAt > Date.now()
              ).length;
              const totalCount = dayDiaries.length;

              return (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedDate(ds);
                    if (totalCount > 0) setShowDayDetail(ds);
                    else setShowDayDetail(null);
                  }}
                  className={[
                    "relative aspect-square md:aspect-[1/1] rounded-lg md:rounded-xl flex flex-col items-center justify-center",
                    "text-sm md:text-base transition-all duration-150",
                    !inMonth ? "text-paper-ink3/40" : "text-paper-ink",
                    // 选中任何日期 → 框框（优先级最高）
                    isSelected ? "bg-paper-accent/20 ring-2 ring-paper-accent" : "",
                    // 今天没被选中 → 紫粉渐变
                    !isSelected && isToday ? "ring-2 ring-paper-accent/60" : "",
                    // 未选中且非今天 → hover 效果
                    !isSelected && !isToday ? "hover:bg-paper-surface active:bg-paper-line/60" : "",
                  ].join(" ")}
                >
                  <span className="font-medium">{d.getDate()}</span>
                  {mood ? (
                    <span className="text-[14px] md:text-base leading-none mt-0.5">
                      {mood.icon}
                    </span>
                  ) : capsuleCount > 0 ? (
                    <span className="text-[12px] mt-0.5">🔒</span>
                  ) : null}
                  {plansByDate.get(ds) && (
                    <span className="absolute top-0.5 right-1 text-[10px]" title="计划到期">🎯</span>
                  )}
                  {milestonesByDate.get(ds) && (
                    <span className="absolute top-0.5 left-1 text-[10px]" title="纪念日">🎈</span>
                  )}
                  {totalCount > 1 && (
                    <span className={[
                      "absolute bottom-0.5 right-1 text-[10px] leading-none rounded-full px-1 py-0.5",
                      isSelected ? "bg-paper-surface text-paper-ink" : "bg-paper-accent/15 text-paper-accent",
                    ].join(" ")}>
                      ×{totalCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 快捷入口（原顶部跑马灯）*/}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { icon: "🏷️", label: "标签", path: "/tags" },
            { icon: "🎈", label: "纪念日", path: "/milestones" },
            { icon: "🎯", label: "计划", path: "/plans" },
            { icon: "💰", label: "记账", path: "/finance" },
            { icon: "🫧", label: "时光胶囊", path: "/capsule" },
            { icon: "🗑️", label: "回收站", path: "/trash" },
          ].map((q) => (
            <button key={q.path} type="button" onClick={() => nav(q.path)}
              className="flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-paper-card border border-paper-line/70 shadow-card hover:shadow-cardHover active:scale-95 transition">
              <span className="text-xl leading-none">{q.icon}</span>
              <span className="text-[11px] text-paper-ink2">{q.label}</span>
            </button>
          ))}
        </div>

        {/* On This Day */}
        <OnThisDay diaries={diaries} />

        {/* 当日日记 */}
        <section className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <DayList date={selectedDate} diaries={byDate.get(selectedDate) ?? []} onSoftDelete={onSoftDelete} />
        </section>


          </>
        ) : (
          <MoodHeatmap diaries={diaries} />
        )}
      </main>

      {/* 日期模板统计弹窗 */}
      {showDayDetail && (() => {
        const dayDiaries = byDate.get(showDayDetail) ?? [];
        const tplCount: Record<string, number> = {};
        for (const d of dayDiaries) {
          const tid = d.templateId ?? "diary";
          tplCount[tid] = (tplCount[tid] ?? 0) + 1;
        }
        const mood = moodById(dayDiaries[0]?.moodId);
        return dayDiaries.length > 0 ? (
          <div
            className="fixed inset-0 z-50 footer-safe bg-black/30 flex items-end md:items-center justify-center"
            onClick={() => setShowDayDetail(null)}
          >
            <div
              className="bg-paper-card rounded-t-2xl md:rounded-2xl p-5 w-full md:w-[340px] md:shadow-xl animate-fade-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-paper-ink flex items-center gap-2">
                  {mood && <span className="text-lg">{mood.icon}</span>}
                  {showDayDetail}
                  <span className="text-sm text-paper-ink2 font-normal">· {dayDiaries.length} 篇</span>
                </h4>
                <button
                  onClick={() => setShowDayDetail(null)}
                  className="w-7 h-7 rounded-full bg-paper-surface hover:bg-paper-line/60 text-paper-ink2 flex items-center justify-center"
                >✕</button>
              </div>
              <div className="space-y-2">
                {Object.entries(tplCount)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tid, c]) => {
                    const tpl = TEMPLATES.find((t) => t.id === tid);
                    return (
                      <div key={tid} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-paper-surface/60">
                        <span className="text-lg">{tpl?.icon ?? "📖"}</span>
                        <span className="text-sm text-paper-ink2 flex-1">{tpl?.name ?? "日记"}</span>
                        <span className="font-semibold text-paper-ink">{c} 篇</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* 🫧 悬浮胶囊底栏（共享组件，书柜/日记/我的 页也会渲染，Tab 切换时不再消失） */}
      <BottomDock active="memories" avatarKey={avatarKey} />

      {/* === 新手指引 === */}
      {showOnboarding && (
        <OnboardingWizard
          nickname={userProfile?.nickname}
          onComplete={() => {
            setShowOnboarding(false);
            setShowTour(true);
          }}
          onSkip={() => {
            setShowOnboarding(false);
            // 跳过问卷直接看引导
            if (!hasSeenTour()) setShowTour(true);
          }}
        />
      )}

      {showTour && (
        <FeatureTour
          open={showTour}
          onFinish={() => { markTourSeen(); setShowTour(false); }}
          onSkip={() => { markTourSeen(); setShowTour(false); }}
          steps={TOUR_STEPS}
        />
      )}
    </div>
  );
}

  /** 主界面引导步骤 — 覆盖整个首页从上到下 */
const TOUR_STEPS: TourStep[] = [
  {
    selector: "#tour-tabs",
    title: "🗂️ 两种视图",
    description: "按月看每天，按年看心情变化。",
  },
  {
    selector: "#tour-month-grid",
    title: "📅 月历视图",
    description: "这里是你的日历。写过日记的日子会显示心情图标，点一下就能翻那天的记录。",
  },
  {
    selector: "#tour-tab-yearly",
    title: "📊 年度回顾",
    description: "想看看一整年的心情变化？点这里切换年度回顾视图。",
  },
  {
    selector: "#tour-dock-memories",
    title: "🕰️ 回忆",
    description: "写过的所有日记都在这里，按时间线翻看，也可以切到书柜，像读书一样回顾。",
  },
  {
    selector: "#tour-dock-xiaomai",
    title: "🌾 小麦",
    description: "想不起哪天发生了什么？问小麦就行。它读过你所有的日记，帮你找、帮你回忆。",
  },
  {
    selector: "#tour-dock-voice",
    title: "🎤 语音快记",
    description: "对着麦克风说几句，小麦帮你转成文字、匹配模板，一秒生成日记。",
  },
  {
    selector: "#tour-dock-profile",
    title: "👤 我的",
    description: "头像、昵称、主题、数据备份都在这里管理。新手指引也可以在这里重新看。",
  },
];
