import { useState } from "react";
import type { Diary, MoodId } from "../types";
import { MOOD_TAGS, moodById } from "../data";

interface Props {
  diaries: Diary[];
}

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** 年度心情热力图 */
export default function MoodHeatmap({ diaries }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  // 把日记按 date 索引
  const byDate = new Map<string, Diary>();
  for (const d of diaries) {
    if (d.date.startsWith(`${year}-`)) byDate.set(d.date, d);
  }

  // 生成月度数据
  const months: { label: string; cells: (Diary | null)[] }[] = [];
  for (let m = 0; m < 12; m++) {
    const firstOfMonth = new Date(year, m, 1);
    const firstDow = (firstOfMonth.getDay() + 6) % 7;
    const dim = new Date(year, m + 1, 0).getDate();
    const cells: (Diary | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) {
      const ds = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(byDate.get(ds) ?? null);
    }
    months.push({ label: MONTHS[m], cells });
  }

  const moodColor = (mid: MoodId | null | undefined): string => {
    if (!mid) return "transparent";
    return moodById(mid)?.color ?? "transparent";
  };

  return (
    <div className="card p-4 animate-fade-up" style={{ animationDelay: "160ms" }}>
      {/* 标题 + 年份切换 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <span className="font-medium text-paper-ink">心情热力图</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="w-7 h-7 rounded-full hover:bg-paper-surface text-paper-ink"
          >‹</button>
          <span className="text-sm font-medium text-paper-ink w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => Math.min(y + 1, now.getFullYear()))}
            className="w-7 h-7 rounded-full hover:bg-paper-surface text-paper-ink"
          >›</button>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {MOOD_TAGS.map((m) => (
          <div key={m.id} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-paper-ink2">{m.icon} {m.name}</span>
          </div>
        ))}
      </div>

      {/* 12 个月小网格 */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {months.map((mo) => (
          <div key={mo.label}>
            <div className="text-[10px] text-paper-ink2 mb-1 font-medium">{mo.label}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {mo.cells.map((cell, i) => {
                return (
                  <div
                    key={i}
                    title={cell ? `${cell.date} · ${moodById(cell.moodId)?.name ?? ""}` : ""}
                    className={`aspect-square rounded-[2px] ${
                      cell
                        ? "cursor-pointer hover:ring-1 hover:ring-paper-accent"
                        : "bg-paper-line/30"
                    }`}
                    style={{
                      backgroundColor: cell ? moodColor(cell.moodId) : undefined,
                      opacity: cell ? 1 : 0.4,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 统计 */}
      <div className="mt-4 pt-3 border-t border-paper-line text-xs text-paper-ink2 flex justify-between">
        <span>本年 {byDate.size} 天写了日记</span>
        <span>共 {diaries.length} 篇</span>
      </div>
    </div>
  );
}
