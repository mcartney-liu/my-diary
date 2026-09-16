import { useMemo, useState } from "react";
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
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const [showDayDetail, setShowDayDetail] = useState<string | null>(null);

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
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => nav("/tags")}
              title="标签"
              className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
            >
              🏷️
            </button>
            <button
              onClick={() => nav("/capsule")}
              title="时间胶囊"
              className="px-2.5 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-sm hover:bg-amber-100 transition active:scale-95"
            >
              🫧
            </button>
            <button
              onClick={() => nav("/trash")}
              title="回收站"
              className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
            >
              🗑️
            </button>
            <button
              onClick={() => nav("/profile")}
              title="我的"
              className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
            >
              👤
            </button>
            <button onClick={() => nav("/editor")} className="btn-primary flex items-center gap-1.5 text-sm">
              <span className="text-base leading-none">＋</span> 写日记
            </button>
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

      {/* 📱 底部固定操作栏 */}
      <nav className="fixed bottom-0 inset-x-0 z-20 backdrop-blur-sm bg-[#faf6ef]/90 border-t border-paper-line">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-center">
          <VoiceQuickEntry />
        </div>
      </nav>
    </div>
  );
}
