import type { Diary } from "../types";
import { computeStreak, computeMaxStreak } from "../data";

interface Props {
  diaries: Diary[];
}

export default function StreakBadge({ diaries }: Props) {
  const streak = computeStreak(diaries);
  const max = computeMaxStreak(diaries);
  const total = diaries.length;

  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-2xl shadow-md">
            🔥
          </div>
          <div>
            <div className="text-2xl font-bold text-paper-ink leading-tight">
              {streak} <span className="text-sm font-normal text-paper-ink2">天连续</span>
            </div>
            <div className="text-xs text-paper-ink2">
              最长 {max} 天 · 共 {total} 篇日记
            </div>
          </div>
        </div>
        {streak >= 3 && (
          <div className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-600 font-medium">
            {streak >= 30 ? "🔥🔥🔥 月度达人" : streak >= 7 ? "🔥🔥 本周坚持" : "🔥 不错哦"}
          </div>
        )}
      </div>
      {/* 近 7 天格子 */}
      <div className="mt-3 flex gap-1">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          const has = diaries.some(
            (x) => x.date === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
          const isToday = i === 6;
          return (
            <div key={i} className="flex-1 text-center">
              <div className={`h-6 rounded-md flex items-center justify-center text-xs transition ${
                has
                  ? "bg-paper-accent text-white font-medium"
                  : "bg-paper-line/40 text-paper-ink2/30"
              } ${isToday ? "ring-2 ring-paper-accent/40" : ""}`}>
                {has ? "✓" : "·"}
              </div>
              <div className="text-[10px] text-paper-ink2 mt-1">
                {["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
