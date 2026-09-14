import { useEffect, useMemo, useState } from "react";
import type { Diary } from "../types";
import { computeStreak, computeMaxStreak, fmtDate } from "../data";
import { summarizeDay } from "../ai";

interface Props {
  diaries: Diary[];
}

export default function StreakBadge({ diaries }: Props) {
  const streak = computeStreak(diaries);
  const max = computeMaxStreak(diaries);
  const total = diaries.length;

  const now = new Date();
  const todayStr = fmtDate(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmtDate(yesterday);

  const hasToday = diaries.some((x) => x.date === todayStr);
  const hasYesterday = diaries.some((x) => x.date === yesterdayStr);

  const todayDiaries = useMemo(
    () => diaries.filter((d) => d.date === todayStr),
    [diaries, todayStr]
  );
  const yesterdayDiaries = useMemo(
    () => diaries.filter((d) => d.date === yesterdayStr),
    [diaries, yesterdayStr]
  );

  // 🔑 AI 总结
  const [todaySummary, setTodaySummary] = useState<string | null>(null);
  const [yesterdaySummary, setYesterdaySummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (todayDiaries.length) {
      summarizeDay(todayDiaries, todayStr).then((s) => {
        if (!cancelled && s) setTodaySummary(s);
      });
    }
    if (yesterdayDiaries.length) {
      summarizeDay(yesterdayDiaries, yesterdayStr).then((s) => {
        if (!cancelled && s) setYesterdaySummary(s);
      });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayDiaries.length, yesterdayDiaries.length]);

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

      {/* 🔑 有温度的 AI 总结 — 昨天 */}
      {hasYesterday && (
        <div className="mt-3 text-xs text-paper-ink2 leading-relaxed">
          <span className="text-paper-ink3">昨天</span>
          <span className="mx-1">·</span>
          <span className="text-[13px] text-paper-ink/80">
            {yesterdaySummary ?? "✨ 回忆中..."}
          </span>
        </div>
      )}

      {/* 🔑 有温度的 AI 总结 — 今天 */}
      {hasToday && (
        <div className="mt-1.5 text-xs text-paper-ink2 leading-relaxed">
          <span className="text-paper-ink3">今天</span>
          <span className="mx-1">·</span>
          <span className="text-[13px] text-paper-ink/80">
            {todaySummary ?? "✨ 正在记录..."}
          </span>
        </div>
      )}

      {/* 没写日记时的提示（保持不变） */}
      {!hasToday && streak > 0 && (
        <div className="mt-3 text-xs text-amber-600">今天写一篇就不断！</div>
      )}
      {!hasToday && streak === 0 && (
        <div className="mt-3 text-xs text-paper-ink2">今天开始，第一天 ✨</div>
      )}

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
