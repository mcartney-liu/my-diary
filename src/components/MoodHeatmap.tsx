import { useMemo, useState } from "react";
import type { Diary, MoodId } from "../types";
import { MOOD_TAGS, moodById } from "../data";

interface Props {
  diaries: Diary[];
}

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** 年度心情分布条形图 */
function MoodBarChart({ diaries, year }: { diaries: Diary[]; year: number }) {
  const counts = useMemo(() => {
    const map = new Map<MoodId | null, number>();
    for (const m of MOOD_TAGS) map.set(m.id, 0);
    map.set(null, 0);
    for (const d of diaries) {
      if (!d.date.startsWith(`${year}-`)) continue;
      const key = d.moodId ?? null;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [diaries, year]);

  const total = useMemo(() => {
    let t = 0;
    for (const v of counts.values()) t += v;
    return t;
  }, [counts]);

  return (
    <div>
      <h3 className="text-sm font-medium text-paper-ink mb-3 flex items-center gap-1.5">
        <span>🌈</span> 心情分布
      </h3>
      <div className="space-y-2">
        {MOOD_TAGS.map((m) => {
          const c = counts.get(m.id) ?? 0;
          const pct = total > 0 ? (c / total) * 100 : 0;
          return (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-lg w-6 text-center">{m.icon}</span>
              <span className="text-xs text-paper-ink2 w-12 shrink-0">{m.name}</span>
              <div className="flex-1 h-4 bg-paper-line/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: m.color,
                  }}
                />
              </div>
              <span className="text-[11px] text-paper-ink3 w-8 text-right">{c}天</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[11px] text-paper-ink3 text-center">
        {total} 天有心情记录 · {diaries.filter((d) => d.date.startsWith(`${year}-`)).length} 篇日记
      </div>
    </div>
  );
}

/** GitHub 风格年度写作密度图 */
function WritingDensity({ diaries, year }: { diaries: Diary[]; year: number }) {
  // 每一天的写作总字数 + 日记数
  const dayStats = useMemo(() => {
    const map = new Map<string, { count: number; words: number }>();
    for (const d of diaries) {
      if (!d.date.startsWith(`${year}-`)) continue;
      let words = 0;
      for (const b of d.blocks) {
        if (b.kind === "text") words += b.content.length;
      }
      const existing = map.get(d.date);
      if (existing) {
        existing.count += 1;
        existing.words += words;
      } else {
        map.set(d.date, { count: 1, words });
      }
    }
    return map;
  }, [diaries, year]);

  const maxWords = useMemo(() => {
    let m = 0;
    for (const v of dayStats.values()) if (v.words > m) m = v.words;
    return Math.max(m, 1);
  }, [dayStats]);

  // 生成 53 周 × 7 天 的网格
  const weeks = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    // 第一个周一
    const firstDow = (jan1.getDay() + 6) % 7; // 周一=0
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - firstDow);

    const grid: (Date | null)[][] = [];
    let cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const week: (Date | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const y = cur.getFullYear();
        week.push(y === year ? new Date(cur) : null);
        cur.setDate(cur.getDate() + 1);
      }
      grid.push(week);
    }
    return grid;
  }, [year]);

  const dowLabels = ["一", "", "三", "", "五", "", "日"];
  const monthLabelsAt = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44];

  const cellColor = (date: Date | null): string => {
    if (!date) return "transparent";
    const ds = date.toISOString().slice(0, 10);
    const stats = dayStats.get(ds);
    if (!stats) return "#efe8dc"; // paper-line/40 风格的浅灰
    const ratio = Math.sqrt(stats.words / maxWords); // sqrt 让差异更柔和
    // 4 级绿色
    if (ratio < 0.25) return "#a7d8b0";
    if (ratio < 0.5) return "#6bbf7c";
    if (ratio < 0.75) return "#3ea057";
    return "#1f7a37";
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-paper-ink mb-3 flex items-center gap-1.5">
        <span>✍️</span> 写作密度
      </h3>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* 月份标签 */}
          <div className="flex mb-1 pl-5">
            {MONTHS.map((label, i) => (
              <div
                key={label}
                className="text-[10px] text-paper-ink3"
                style={{ width: "14px", marginLeft: i === 0 ? 0 : (monthLabelsAt[i] - monthLabelsAt[i - 1] - 1) * 14 }}
              >
                {label[0]}
              </div>
            ))}
          </div>
          <div className="flex gap-[2px]">
            {/* 星期标签 */}
            <div className="flex flex-col gap-[2px] mr-1 justify-between" style={{ height: 98 }}>
              {dowLabels.map((d, i) => (
                <span key={i} className="text-[10px] text-paper-ink3 leading-[12px]">{d}</span>
              ))}
            </div>
            {/* 53 周 */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.map((date, di) => {
                  const ds = date?.toISOString().slice(0, 10);
                  const stats = ds ? dayStats.get(ds) : null;
                  return (
                    <div
                      key={di}
                      title={date && stats
                        ? `${ds} · ${stats.count} 篇 · ${stats.words} 字`
                        : date ? `${ds} · 未写` : ""}
                      className="w-[12px] h-[12px] rounded-[2px] transition-transform hover:scale-125 cursor-pointer"
                      style={{ backgroundColor: cellColor(date) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-1 mt-3 text-[10px] text-paper-ink3">
        <span>少</span>
        {["#efe8dc", "#a7d8b0", "#6bbf7c", "#3ea057", "#1f7a37"].map((c) => (
          <span key={c} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: c }} />
        ))}
        <span>多</span>
        <span className="ml-auto">
          最多的一天 {Array.from(dayStats.values()).reduce((a, b) => Math.max(a, b.words), 0)} 字
        </span>
      </div>
    </div>
  );
}

/** 月度心情概览 */
function MonthlyOverview({ diaries, year }: { diaries: Diary[]; year: number }) {
  const months = useMemo(() => {
    const result: {
      label: string;
      totalDays: number;
      topMood: { id: MoodId; icon: string; name: string; count: number } | null;
    }[] = [];

    for (let m = 0; m < 12; m++) {
      const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
      const monthDiaries = diaries.filter((d) => d.date.startsWith(prefix));

      // 按天聚合（每天取最后一篇的心情）
      const moodCount = new Map<MoodId | null, number>();
      for (const d of monthDiaries) {
        const key = d.moodId ?? null;
        moodCount.set(key, (moodCount.get(key) ?? 0) + 1);
      }

      let topMood: { id: MoodId; icon: string; name: string; count: number } | null = null;
      let topCount = 0;
      for (const [mid, c] of moodCount) {
        if (mid && c > topCount) {
          const info = moodById(mid);
          if (info) {
            topMood = { id: mid, icon: info.icon, name: info.name, count: c };
            topCount = c;
          }
        }
      }

      result.push({
        label: MONTHS[m],
        totalDays: monthDiaries.length,
        topMood,
      });
    }
    return result;
  }, [diaries, year]);

  return (
    <div>
      <h3 className="text-sm font-medium text-paper-ink mb-3 flex items-center gap-1.5">
        <span>📈</span> 月度概览
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        {months.map((m) => (
          <div
            key={m.label}
            className="p-2.5 rounded-xl bg-paper-surface/60 border border-paper-line/50 text-center"
          >
            <div className="text-[10px] text-paper-ink2">{m.label}</div>
            {m.totalDays > 0 ? (
              <>
                <div className="text-lg leading-none mt-1">
                  {m.topMood ? m.topMood.icon : "✏️"}
                </div>
                <div className="text-[11px] text-paper-ink2 mt-1">
                  {m.totalDays} 篇
                </div>
              </>
            ) : (
              <div className="text-sm text-paper-ink3 italic mt-1">—</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MoodHeatmap({ diaries }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const yearTotal = diaries.filter((d) => d.date.startsWith(`${year}-`)).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* 标题 + 年份切换 */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-paper-ink flex items-center gap-2">
            <span className="text-lg">📊</span> {year} 年度回顾
          </h2>
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
        <div className="mt-2 text-xs text-paper-ink2">
          全年 {yearTotal} 篇日记 · {
            new Set(diaries.filter((d) => d.date.startsWith(`${year}-`)).map((d) => d.date)).size
          } 天有记录
        </div>
      </div>

      {/* 心情分布 */}
      <div className="card p-4 md:p-5">
        <MoodBarChart diaries={diaries} year={year} />
      </div>

      {/* 写作密度 */}
      <div className="card p-4 md:p-5">
        <WritingDensity diaries={diaries} year={year} />
      </div>

      {/* 月度概览 */}
      <div className="card p-4 md:p-5">
        <MonthlyOverview diaries={diaries} year={year} />
      </div>
    </div>
  );
}
