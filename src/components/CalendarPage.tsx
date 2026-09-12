import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { monthCells, moodById } from "../data";
import MoodStats from "./MoodStats";
import DayList from "./DayList";

interface Props {
  diaries: Diary[];
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage({ diaries }: Props) {
  const nav = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = now;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const cells = useMemo(() => monthCells(year, month), [year, month]);

  // 按 date 索引日记
  const byDate = useMemo(() => {
    const m = new Map<string, Diary[]>();
    for (const d of diaries) {
      const arr = m.get(d.date) ?? [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return m;
  }, [diaries]);

  // 按 date 索引心情（每天取最后一篇日记的心情）
  const moodByDate = useMemo(() => {
    const m = new Map<string, { moodId: string; count: number }>();
    for (const d of diaries) {
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

  const todayStr = now.toISOString().slice(0, 10);

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
          <button onClick={() => nav("/editor")} className="btn-primary flex items-center gap-1.5 text-sm">
            <span className="text-base leading-none">＋</span> 写日记
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
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
              const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const inMonth = d.getMonth() === month;
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              const moodInfo = moodByDate.get(ds);
              const mood = moodInfo?.moodId ? moodById(moodInfo.moodId) : null;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(ds)}
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
                  {mood && (
                    <span className="text-[14px] md:text-base leading-none mt-0.5">
                      {mood.icon}
                    </span>
                  )}
                  {moodInfo && moodInfo.count > 1 && (
                    <span className={[
                      "absolute bottom-0.5 right-1 text-[10px] leading-none rounded-full px-1 py-0.5",
                      isSelected ? "bg-paper-surface text-paper-ink" : "bg-paper-accent/15 text-paper-accent",
                    ].join(" ")}>
                      ×{moodInfo.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 心情统计 + 当日日记 */}
        <section className="space-y-6 animate-fade-up" style={{ animationDelay: "80ms" }}>
          <MoodStats diaries={diaries} year={year} month={month} />
          <DayList date={selectedDate} diaries={byDate.get(selectedDate) ?? []} />
        </section>
      </main>
    </div>
  );
}
