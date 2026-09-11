import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronLeft, ChevronRight, BookHeart } from "lucide-react";
import type { Diary } from "../types";
import { moodById, monthCells, parseDate, pad, today } from "../data";
import MoodStats from "./MoodStats";
import DayList from "./DayList";

interface Props { diaries: Diary[]; }

export default function CalendarPage({ diaries }: Props) {
  const nav = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [selected, setSelected] = useState<string>(today());

  // diary map: date -> diaries
  const byDate = useMemo(() => {
    const m = new Map<string, Diary[]>();
    for (const d of diaries) {
      const arr = m.get(d.date) ?? [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return m;
  }, [diaries]);

  // 心情统计（当月）
  const monthDiaries = useMemo(() => {
    return diaries.filter((d) => {
      const pd = parseDate(d.date);
      return pd.getFullYear() === year && pd.getMonth() === month;
    });
  }, [diaries, year, month]);

  const cells = useMemo(() => monthCells(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  };

  const selectedDiaries = byDate.get(selected) ?? [];

  return (
    <div className="min-h-screen bg-paper-bg">
      <header className="sticky top-0 z-10 bg-paper-bg/90 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookHeart size={22} className="text-paper-accent" />
            <span className="font-bold text-lg text-paper-ink">MyDiary</span>
          </div>
          <button
            onClick={() => nav("/editor")}
            className="flex items-center gap-1.5 bg-paper-ink text-paper-bg rounded-full px-4 py-1.5 text-sm font-medium hover:opacity-90 active:scale-95 transition"
          >
            <Plus size={16} /> 写日记
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-24 pt-2">
        {/* 月份切换 */}
        <div className="flex items-center justify-center gap-4 py-3">
          <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-paper-surface active:scale-95">
            <ChevronLeft size={20} className="text-paper-ink" />
          </button>
          <div className="font-bold text-paper-ink text-lg min-w-[120px] text-center">
            {year} 年 {month + 1} 月
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-paper-surface active:scale-95">
            <ChevronRight size={20} className="text-paper-ink" />
          </button>
        </div>

        {/* 月历 */}
        <div className="bg-paper-surface/70 rounded-2xl p-3 border border-paper-line">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-paper-ink2 mb-1">
            {["一","二","三","四","五","六","日"].map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
              const isCurMonth = d.getMonth() === month;
              const isSelected = selected === dateStr;
              const entries = byDate.get(dateStr) ?? [];
              const topMood = entries[0]?.moodId;
              const mood = topMood ? moodById(topMood) : null;
              const isToday = dateStr === today();

              return (
                <button
                  key={i}
                  onClick={() => setSelected(dateStr)}
                  className={[
                    "cal-day aspect-square rounded-xl flex flex-col items-center justify-center text-sm relative",
                    isSelected ? "bg-paper-ink text-paper-bg shadow-md" :
                    !isCurMonth ? "text-paper-ink2/40" :
                    "text-paper-ink hover:bg-paper-line/40",
                    isToday && !isSelected ? "ring-2 ring-paper-accent/60" : "",
                  ].join(" ")}
                >
                  <span className={entries.length > 0 ? "text-base" : "text-sm"}>
                    {isCurMonth ? d.getDate() : ""}
                  </span>
                  {mood && isCurMonth && (
                    <span className="text-[14px] leading-none mt-0.5">{mood.icon}</span>
                  )}
                  {entries.length > 1 && isCurMonth && (
                    <span className="absolute bottom-0.5 right-1 text-[9px] opacity-70">×{entries.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 心情统计 */}
        <MoodStats diaries={monthDiaries} />

        {/* 当日日记列表 */}
        <DayList date={selected} diaries={selectedDiaries} onOpen={(id) => nav(`/editor/${id}`)} />
      </main>
    </div>
  );
}
