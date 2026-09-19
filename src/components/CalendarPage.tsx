import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { monthCells, moodById, fmtDate } from "../data";
import { TEMPLATES } from "../templates";
import StreakBadge from "./StreakBadge";
import SearchBar from "./SearchBar";
import OnThisDay from "./OnThisDay";
import MoodHeatmap from "./MoodHeatmap";
import DayList from "./DayList";
import VoiceQuickEntry from "./VoiceQuickEntry";
import AiChatView from "./AiChatView";

interface Props {
  diaries: Diary[];
  onSoftDelete?: (id: string) => void;
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage({ diaries, onSoftDelete }: Props) {
  const nav = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(() => fmtDate(now));
  const [view, setView] = useState<"monthly" | "yearly" | "ai">("monthly");
  const [showDayDetail, setShowDayDetail] = useState<string | null>(null);

  // 🎠 跑马灯 touch 手势：手指拖时停动画 + 手动跟手，松手继续自动跑（接回当前位置）
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [marqueePaused, setMarqueePaused] = useState(false);
  const dragStartX = useRef(0);
  const dragOffset = useRef(0);        // 本轮手势累计偏移
  const baseOffset = useRef(0);        // touchstart 时的"冻结位置"
  const autoOffset = useRef(0);        // 松手后自动循环的当前位置（JS 驱动）
  const lastFrameTime = useRef(0);
  const rafId = useRef<number | null>(null);

  // 自动循环速度：25s 一轮，换算成 px/ms
  const AUTO_SPEED = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const track = trackRef.current;
    const half = track ? track.scrollWidth / 2 : 150;
    return half / 25000; // px per ms
  }, []);

  const stopAutoLoop = () => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  const startAutoLoopFromCurrent = () => {
    // 从当前 transform 位置开始，用 JS rAF 驱动（不再用 CSS keyframes，避免重置到 0 弹回）
    stopAutoLoop();
    const track = trackRef.current;
    if (!track) return;
    track.style.animation = "none"; // 关掉 CSS animation，完全手动
    lastFrameTime.current = performance.now();

    const tick = (now: number) => {
      const dt = now - lastFrameTime.current;
      lastFrameTime.current = now;
      // 左移 = 负方向，速度 * dt
      autoOffset.current -= AUTO_SPEED * dt;
      // 循环：滑到 -halfWidth 时重置到 0
      const half = track.scrollWidth / 2;
      if (autoOffset.current <= -half) autoOffset.current += half;
      track.style.transform = `translateX(${autoOffset.current}px)`;
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
  };

  const handleMarqueeTouchStart = (e: React.TouchEvent) => {
    stopAutoLoop();
    dragStartX.current = e.touches[0].clientX;
    dragOffset.current = 0;
    const track = trackRef.current;
    if (track) {
      // 冻结当前位置——不管是 CSS animation 还是 JS rAF 驱动的
      const anim = track.getAnimations()[0];
      if (anim) {
        // CSS animation 还在跑：读进度算当前 translate
        const totalMs = 25000;
        const progress = Math.min(1, Math.max(0, (anim.currentTime as number) / totalMs));
        const half = track.scrollWidth / 2;
        baseOffset.current = -half * progress;
        track.style.animationPlayState = "paused";
      } else if (autoOffset.current !== 0 || track.style.transform) {
        // JS rAF 驱动中：用 autoOffset
        baseOffset.current = autoOffset.current;
      }
    }
    setMarqueePaused(true);
  };

  const handleMarqueeTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const dx = e.touches[0].clientX - dragStartX.current;
    dragStartX.current = e.touches[0].clientX;
    dragOffset.current += dx;
    if (trackRef.current) {
      trackRef.current.style.animation = "none";
      trackRef.current.style.transform = `translateX(${baseOffset.current + dragOffset.current}px)`;
    }
  };

  const handleMarqueeTouchEnd = () => {
    if (trackRef.current) {
      // 把当前手动拖动的最终位置保存为 autoOffset 起点
      autoOffset.current = baseOffset.current + dragOffset.current;
      // 清掉 inline transform（startAutoLoopFromCurrent 会重新写）
      trackRef.current.style.transform = "";
      trackRef.current.style.animation = "";
      trackRef.current.style.animationPlayState = "";
    }
    dragOffset.current = 0;
    baseOffset.current = 0;
    setMarqueePaused(false);
    // 从当前用户松手的位置接回自动循环
    startAutoLoopFromCurrent();
  };

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

  return (
    <div className="min-h-screen pb-24">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-[#faf6ef]/85 border-b border-paper-line/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-paper-ink text-paper-bg flex items-center justify-center text-lg">
              📔
            </div>
            <span className="text-paper-ink font-semibold text-lg tracking-wide">MyDiary</span>
          </div>
          <div
            ref={marqueeRef}
            className={`marquee-wrapper overflow-hidden max-w-[58%] md:max-w-none select-none ${marqueePaused ? "marquee-paused" : ""}`}
            onTouchStart={handleMarqueeTouchStart}
            onTouchMove={handleMarqueeTouchMove}
            onTouchEnd={handleMarqueeTouchEnd}
          >
            <div ref={trackRef} className="flex gap-1.5 marquee-track whitespace-nowrap">
              {/* 第一份 */}
              <button
                onClick={() => nav("/tags")}
                title="标签"
                className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95 flex-shrink-0"
              >
                🏷️
              </button>
              <button
                onClick={() => nav("/milestones")}
                title="纪念日"
                className="px-2.5 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-sm hover:bg-rose-100 transition active:scale-95 flex-shrink-0"
              >
                🎈
              </button>
              <button
                onClick={() => nav("/plans")}
                title="计划"
                className="px-2.5 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-sm hover:bg-blue-100 transition active:scale-95 flex-shrink-0"
              >
                🎯
              </button>
              <button
                onClick={() => nav("/finance")}
                title="记账统计"
                className="px-2.5 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-sm hover:bg-emerald-100 transition active:scale-95 flex-shrink-0"
              >
                💰
              </button>
              <button
                onClick={() => nav("/capsule")}
                title="时间胶囊"
                className="px-2.5 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-sm hover:bg-amber-100 transition active:scale-95 flex-shrink-0"
              >
                🫧
              </button>
              <button
                onClick={() => nav("/trash")}
                title="回收站"
                className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95 flex-shrink-0"
              >
                🗑️
              </button>
              {/* 第二份（复制一份让动画无缝循环） */}
              <button
                onClick={() => nav("/tags")}
                title="标签"
                className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95 flex-shrink-0"
              >
                🏷️
              </button>
              <button
                onClick={() => nav("/milestones")}
                title="纪念日"
                className="px-2.5 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-sm hover:bg-rose-100 transition active:scale-95 flex-shrink-0"
              >
                🎈
              </button>
              <button
                onClick={() => nav("/plans")}
                title="计划"
                className="px-2.5 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-sm hover:bg-blue-100 transition active:scale-95 flex-shrink-0"
              >
                🎯
              </button>
              <button
                onClick={() => nav("/finance")}
                title="记账统计"
                className="px-2.5 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-sm hover:bg-emerald-100 transition active:scale-95 flex-shrink-0"
              >
                💰
              </button>
              <button
                onClick={() => nav("/capsule")}
                title="时间胶囊"
                className="px-2.5 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-sm hover:bg-amber-100 transition active:scale-95 flex-shrink-0"
              >
                🫧
              </button>
              <button
                onClick={() => nav("/trash")}
                title="回收站"
                className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95 flex-shrink-0"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* 搜索栏 */}
        <SearchBar diaries={diaries} />

        {/* 打卡徽章 */}
        <StreakBadge diaries={diaries} />

        {/* 视图切换 */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-paper-surface border border-paper-line w-fit">
          <button
            onClick={() => setView("monthly")}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              view === "monthly"
                ? "bg-paper-ink text-paper-bg shadow-sm"
                : "text-paper-ink2 hover:text-paper-ink"
            }`}
          >
            📅 月历
          </button>
          <button
            onClick={() => setView("yearly")}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              view === "yearly"
                ? "bg-paper-ink text-paper-bg shadow-sm"
                : "text-paper-ink2 hover:text-paper-ink"
            }`}
          >
            📊 年度回顾
          </button>
          <button
            onClick={() => setView("ai")}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              view === "ai"
                ? "bg-paper-ink text-paper-bg shadow-sm"
                : "text-paper-ink2 hover:text-paper-ink"
            }`}
          >
            💬 知识库
          </button>
        </div>

        {view === "monthly" ? (
          <>
        {/* 月历卡片 */}
        <section className="card p-4 md:p-6 animate-fade-up">
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
          <div className="grid grid-cols-7 gap-1 md:gap-2">
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
                    isSelected
                      ? "bg-paper-accent/20 ring-2 ring-paper-accent"
                      : "hover:bg-paper-surface active:bg-paper-line/60",
                    isToday && !isSelected ? "ring-2 ring-paper-accent/60" : "",
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

        {/* On This Day */}
        <OnThisDay diaries={diaries} />

        {/* 当日日记 */}
        <section className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <DayList date={selectedDate} diaries={byDate.get(selectedDate) ?? []} onSoftDelete={onSoftDelete} />
        </section>
          </>
        ) : view === "yearly" ? (
          <MoodHeatmap diaries={diaries} />
        ) : (
          <AiChatView />
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
            className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center"
            onClick={() => setShowDayDetail(null)}
          >
            <div
              className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:w-[340px] md:shadow-xl animate-fade-up"
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

      {/* 📱 底部固定 Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-20 backdrop-blur-sm bg-[#faf6ef]/95 border-t border-paper-line">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-around">
          <button
            onClick={() => nav("/profile")}
            className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl text-paper-ink2 hover:text-paper-accent transition active:scale-95"
          >
            <span className="text-xl leading-none">👤</span>
            <span className="text-[11px] font-medium">我的</span>
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <VoiceQuickEntry />
          </div>

          <button
            onClick={() => nav("/editor")}
            className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl text-paper-ink2 hover:text-paper-accent transition active:scale-95"
          >
            <span className="text-xl leading-none">✏️</span>
            <span className="text-[11px] font-medium">写日记</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
