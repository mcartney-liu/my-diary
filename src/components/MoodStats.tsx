import { useMemo } from "react";
import type { Diary } from "../types";
import { MOOD_TAGS } from "../data";

interface Props {
  diaries: Diary[];
  year: number;
  month: number; // 0-indexed
}

export default function MoodStats({ diaries, year, month }: Props) {
  const stats = useMemo(() => {
    // 当月日记
    const thisMonth = diaries.filter(
      (d) => d.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)
    );
    const dayCount = new Set(thisMonth.map((d) => d.date)).size;

    // 心情分布（按每天最后一篇）
    const moodByDay = new Map<string, string | null>();
    for (const d of thisMonth) moodByDay.set(d.date, d.moodId);

    const counts = Object.fromEntries(MOOD_TAGS.map((m) => [m.id, 0])) as Record<string, number>;
    for (const mid of moodByDay.values()) if (mid) counts[mid]++;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return { dayCount, total, counts };
  }, [diaries, year, month]);

  const hasData = stats.total > 0;

  return (
    <section className="card p-4 md:p-6 animate-fade-up">
      <h2 className="text-base md:text-lg font-semibold text-paper-ink mb-3 flex items-center gap-2">
        <span className="text-paper-accent">📊</span> 本月心情
        {hasData && (
          <span className="text-xs font-normal text-paper-ink2 ml-auto">
            {stats.dayCount} 天 · {stats.total} 篇
          </span>
        )}
      </h2>

      {!hasData ? (
        <p className="text-sm text-paper-ink3 text-center py-4">
          这个月还没有写日记 ✨
        </p>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          {MOOD_TAGS.map((m) => {
            const c = stats.counts[m.id];
            const pct = stats.total ? Math.round((c / stats.total) * 100) : 0;
            return (
              <div key={m.id} className="flex flex-col items-center gap-1">
                <div className="relative w-full h-14 md:h-16 rounded-xl bg-paper-surface overflow-hidden flex items-end">
                  {/* 填充条 */}
                  <div
                    className="absolute inset-x-0 bottom-0 transition-all duration-500 ease-out"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: m.color,
                      opacity: pct > 0 ? 0.85 : 0.2,
                    }}
                  />
                  <div className="relative w-full text-center text-lg md:text-xl leading-none pb-1">
                    {m.icon}
                  </div>
                </div>
                <span className="text-[11px] md:text-xs text-paper-ink2">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
