import type { Diary } from "../types";
import { MOOD_TAGS } from "../data";

export default function MoodStats({ diaries }: { diaries: Diary[] }) {
  const total = diaries.length;

  const stats = MOOD_TAGS.map((m) => {
    const count = diaries.filter((d) => d.moodId === m.id).length;
    return { mood: m, count, pct: total > 0 ? (count / total) * 100 : 0 };
  });
  const daysWritten = new Set(diaries.map((d) => d.date)).size;

  return (
    <div className="bg-paper-surface/70 rounded-2xl p-4 border border-paper-line mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-paper-ink">本月心情</div>
        <div className="text-xs text-paper-ink2">
          {daysWritten} 天 · {total} 篇
        </div>
      </div>

      {total === 0 ? (
        <div className="text-center text-paper-ink2 text-sm py-6">
          本月尚未记录任何心情 😊
        </div>
      ) : (
        <div className="space-y-2">
          {stats.map((s) => (
            <div key={s.mood.id} className="flex items-center gap-2">
              <span className="w-6 text-center text-base">{s.mood.icon}</span>
              <span className="w-12 text-xs text-paper-ink2">{s.mood.name}</span>
              <div className="flex-1 h-2 rounded-full bg-paper-line overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${s.pct}%`, backgroundColor: s.mood.color }}
                />
              </div>
              <span className="w-10 text-right text-xs text-paper-ink2 tabular-nums">
                {s.pct.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
