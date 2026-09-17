import { useEffect, useMemo, useState } from "react";
import type { Diary } from "../types";
import { computeStreak, computeMaxStreak, fmtDate } from "../data";
import { summarizeDay } from "../ai";
import { listSummaries, type DailySummary } from "../api";

interface Props {
  diaries: Diary[];
}

function formatDateLabel(dateStr: string): string {
  // "2026-09-16" → "9月16日"
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}月${parseInt(d)}日`;
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

  // 🔑 历史总结抽屉
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DailySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  // 打开抽屉时拉历史
  useEffect(() => {
    if (!showHistory) return;
    let cancelled = false;
    setHistoryLoading(true);
    listSummaries()
      .then((res) => {
        if (!cancelled) setHistory(res.summaries || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [showHistory]);

  return (
    <>
      <div className="card p-5 animate-fade-up">
        {/* 主区域：icon + 数字 + 标签 */}
        <div className="flex items-center gap-3">
          {/* 火焰 icon — paper 风格 outline */}
          <div className="shrink-0 w-12 h-12 rounded-xl border border-paper-line bg-paper-surface flex items-center justify-center text-xl">
            🔥
          </div>

          {/* 数字 + 标签 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-paper-ink leading-none tracking-tight">
                {streak}
              </span>
              <span className="text-sm text-paper-ink2 font-medium">天</span>
            </div>
            <div className="text-xs text-paper-ink2 mt-0.5">连续写日记中</div>
          </div>

          {/* 里程碑 badge */}
          {streak >= 7 && (
            <div className="shrink-0 text-xs px-2.5 py-1.5 rounded-full bg-orange-100 text-orange-600 font-medium">
              {streak >= 30 ? "月度达人" : streak >= 14 ? "两周坚持" : "本周坚持"}
            </div>
          )}
        </div>

        {/* 🔑 有温度的 AI 总结 — 昨天 */}
        {hasYesterday ? (
          <div className="mt-3 text-xs text-paper-ink2 leading-relaxed">
            <span className="text-paper-ink3">昨天</span>
            <span className="mx-1">·</span>
            <span className="text-[13px] text-paper-ink/80">
              {yesterdaySummary ?? "✨ 回忆中..."}
            </span>
          </div>
        ) : streak > 0 ? (
          // 之前有连续天数，但昨天断了
          <div className="mt-3 text-xs text-paper-ink3 leading-relaxed">
            <span>昨天歇歇也挺好～</span>
          </div>
        ) : null}

        {/* 🔑 有温度的 AI 总结 — 今天 */}
        {hasToday ? (
          <div className={`text-xs text-paper-ink2 leading-relaxed ${hasYesterday ? "mt-1.5" : "mt-3"}`}>
            <span className="text-paper-ink3">今天</span>
            <span className="mx-1">·</span>
            <span className="text-[13px] text-paper-ink/80">
              {todaySummary ?? "✨ 正在记录..."}
            </span>
          </div>
        ) : streak === 0 ? (
          // 刚注册：两行都没写过 — 给一个完整的引导说明
          <div className="mt-3 rounded-lg border border-dashed border-paper-line bg-paper-surface/50 px-3 py-2">
            <p className="text-[12px] text-paper-ink3 leading-relaxed">
              <span className="text-paper-ink/60">✨ 这里会出现什么？</span>
              <br />
              写日记后，AI 会帮你提炼一句话——昨天、今天各一条，点「📖 历史」看全部
            </p>
          </div>
        ) : (
          // 之前有连续天数，今天还没写
          <div className="mt-3 text-xs text-amber-600">今天写一篇就续上啦！</div>
        )}

        {/* 分隔线 */}
        <div className="mt-4 h-px bg-paper-line/60" />

        {/* 底部辅助信息 */}
        <div className="mt-3 flex items-center justify-between text-xs text-paper-ink2">
          <div className="flex items-center gap-3">
            <div>
              最长纪录 <span className="font-medium text-paper-ink">{max}</span> 天
            </div>
            <div>
              共 <span className="font-medium text-paper-ink">{total}</span> 篇
            </div>
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-paper-line bg-paper-surface hover:bg-paper-line/50 text-paper-ink2 transition active:scale-95"
          >
            📖 历史
          </button>
        </div>
      </div>

      {/* 🔑 抽屉：历史总结 */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-up"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="w-full max-w-lg bg-paper-bg rounded-t-2xl border-t border-paper-line shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 抽屉头 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-paper-line">
              <div className="flex items-center gap-2">
                <span className="text-xl">📖</span>
                <h3 className="font-semibold text-paper-ink">每日 AI 总结</h3>
                <span className="text-xs text-paper-ink3">· {history.length} 条</span>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="text-paper-ink3 hover:text-paper-ink text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-paper-line/40"
              >
                ×
              </button>
            </div>

            {/* 抽屉内容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {historyLoading && (
                <div className="py-10 text-center text-xs text-paper-ink3">加载中...</div>
              )}

              {!historyLoading && history.length === 0 && (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">📖</div>
                  <p className="text-sm text-paper-ink2">还没有历史总结</p>
                  <p className="text-xs text-paper-ink3 mt-1">
                    AI 总结从今天开始自动保存，明天就能看到啦
                  </p>
                </div>
              )}

              {!historyLoading && history.length > 0 && (
                history.map((s) => (
                  <div
                    key={s.date}
                    className="p-3 rounded-xl bg-paper-surface border border-paper-line/50"
                  >
                    <div className="text-[11px] text-paper-ink3 mb-1">
                      {formatDateLabel(s.date)}
                      {s.diary_count > 0 && (
                        <span className="ml-2">· {s.diary_count} 篇日记</span>
                      )}
                    </div>
                    <div className="text-sm text-paper-ink leading-relaxed">
                      {s.summary}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
