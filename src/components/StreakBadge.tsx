import type { Diary } from "../types";
import { computeStreak, computeMaxStreak } from "../data";

interface Props {
  diaries: Diary[];
}

export default function StreakBadge({ diaries }: Props) {
  const streak = computeStreak(diaries);
  const max = computeMaxStreak(diaries);
  const total = diaries.length;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const hasYesterday = diaries.some(
    (x) =>
      x.date ===
      `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`
  );
  const hasToday = diaries.some(
    (x) =>
      x.date ===
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`
  );

  return (
    <div className="card p-5 animate-fade-up">
      {/* 主区域：大数字 + 标签 */}
      <div className="flex items-center gap-4">
        {/* 火焰 icon */}
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-2xl shadow-sm">
          🔥
        </div>

        {/* 大数字 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-paper-ink leading-none tracking-tight">
              {streak}
            </span>
            <span className="text-base text-paper-ink2 font-medium">天</span>
          </div>
          <div className="text-sm text-paper-ink2 mt-1">连续写日记中</div>
        </div>

        {/* 里程碑 badge */}
        {streak >= 7 && (
          <div className="shrink-0 text-xs px-2.5 py-1.5 rounded-full bg-orange-100 text-orange-600 font-medium">
            {streak >= 30 ? "月度达人" : streak >= 14 ? "两周坚持" : "本周坚持"}
          </div>
        )}
      </div>

      {/* 状态行：昨天/今天 */}
      <div className="mt-4 flex items-center gap-2 text-xs text-paper-ink2">
        <span className={`px-1.5 py-0.5 rounded ${hasYesterday ? "bg-paper-accent/15 text-paper-accent" : "bg-paper-line/40"}`}>
          昨天 {hasYesterday ? "✓" : "·"}
        </span>
        <span className={`px-1.5 py-0.5 rounded ${hasToday ? "bg-paper-accent/15 text-paper-accent" : "bg-paper-line/40"}`}>
          今天 {hasToday ? "✓" : "·"}
        </span>
        {!hasToday && streak > 0 && (
          <span className="ml-auto text-amber-600">今天写一篇就不断！</span>
        )}
        {streak === 0 && (
          <span className="ml-auto text-paper-ink2">今天开始，第一天 ✨</span>
        )}
      </div>

      {/* 分隔线 */}
      <div className="mt-4 h-px bg-paper-line/60" />

      {/* 底部辅助信息 */}
      <div className="mt-3 flex items-center justify-between text-xs text-paper-ink2">
        <div>
          最长纪录 <span className="font-medium text-paper-ink">{max}</span> 天
        </div>
        <div>
          共 <span className="font-medium text-paper-ink">{total}</span> 篇日记
        </div>
      </div>
    </div>
  );
}
