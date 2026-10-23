import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight, Search, X, Volume2, Image, FileText, Mic, ChevronLeft } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";

interface Props {
  diaries: Diary[];
  onSoftDelete?: (id: string) => void;
}

function weekdayCN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cn = ["日", "一", "二", "三", "四", "五", "六"];
  return cn[new Date(y, m - 1, d).getDay()];
}

function firstBlockText(d: Diary): string {
  const t = d.blocks.find((b) => b.kind === "text")?.content ?? "";
  return t.trim().length > 0 ? (t.length > 80 ? t.slice(0, 80) + "…" : t) : "";
}

function hasImage(d: Diary): boolean {
  return d.blocks.some((b) => b.kind === "image");
}

function hasAudio(d: Diary): boolean {
  return d.blocks.some((b) => b.kind === "audio");
}

function countImages(d: Diary): number {
  return d.blocks.filter((b) => b.kind === "image").length;
}

function audioDurationSec(d: Diary): number {
  let total = 0;
  for (const b of d.blocks) {
    if (b.kind === "audio" && b.durationMs) total += b.durationMs;
  }
  return Math.round(total / 1000);
}

function formatDate(d: Diary): string {
  const date = d.date;
  const [, m, day] = date.split("-").map(Number);
  return `${m}月${day}日`;
}

function formatTime(ts: number): string {
  const dt = new Date(ts);
  return `· ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

// 按日期分组
function groupByDate(diaries: Diary[]): { date: string; items: Diary[] }[] {
  const map = new Map<string, Diary[]>();
  for (const d of diaries) {
    if (d.deletedAt) continue;
    const list = map.get(d.date) ?? [];
    list.push(d);
    map.set(d.date, list);
  }
  // 每组内按 updatedAt 降序，组按日期降序
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => b.updatedAt - a.updatedAt),
    }));
}

export default function DiaryListPage({ diaries }: Props) {
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [moodFilter, setMoodFilter] = useState<string | null>(null);

  const activeDiaries = useMemo(
    () => diaries.filter((d) => !d.deletedAt),
    [diaries]
  );

  // 搜索 + 心情筛选
  const filtered = useMemo(() => {
    let list = activeDiaries;

    if (moodFilter) list = list.filter((d) => (d.moodId ?? "neutral") === moodFilter);

    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter((d) => {
        // 标题
        if (d.title?.toLowerCase().includes(kw)) return true;
        // 正文
        const text = d.blocks
          .filter((b) => b.kind === "text")
          .map((b) => b.content)
          .join(" ")
          .toLowerCase();
        if (text.includes(kw)) return true;
        // 标签
        if (d.tags?.some((t) => t.toLowerCase().includes(kw))) return true;
        return false;
      });
    }

    return list;
  }, [activeDiaries, moodFilter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const totalCount = activeDiaries.length;

  // 心情 chip 统计
  const moodStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of activeDiaries) {
      const mid = d.moodId ?? "neutral";
      map[mid] = (map[mid] ?? 0) + 1;
    }
    return map;
  }, [activeDiaries]);

  const moodList = [
    { id: "happy", label: "开心", color: "#ffd93d" },
    { id: "calm", label: "平静", color: "#7bc47f" },
    { id: "anxious", label: "焦虑", color: "#f0a04b" },
    { id: "sad", label: "难过", color: "#6c8ebf" },
    { id: "angry", label: "生气", color: "#d7263d" },
  ];

  const today = new Date();
  const todayDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const todayWeekday = weekdayCN(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);

  return (
    <div className="min-h-screen bg-paper-bg pb-32">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 bg-paper-bg/90 backdrop-blur-md border-b border-paper-line/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-paper-surface border border-paper-line/80 hover:bg-paper-line/30 transition active:scale-95"
          >
            <ChevronLeft className="w-5 h-5 text-paper-ink" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-paper-ink leading-tight">{todayDate}</h1>
            <p className="text-xs text-paper-ink2">星期{todayWeekday} · {totalCount} 篇日记</p>
          </div>
        </div>
      </header>

      {/* 搜索框 */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-paper-surface border border-paper-line/80 focus-within:border-paper-accent transition">
          <Search className="w-4 h-4 text-paper-ink3 shrink-0" />
          <input
            type="text"
            placeholder="搜索日记、标签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-paper-ink placeholder:text-paper-ink3 min-w-0"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-paper-line/60 text-paper-ink2 hover:bg-paper-line transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 心情 chip 行 */}
      <div className="flex gap-2 px-4 pt-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setMoodFilter(null)}
          className={`shrink-0 h-8 px-3 text-xs font-medium rounded-full border transition ${
            moodFilter === null
              ? "bg-paper-ink text-paper-bg border-paper-ink"
              : "bg-paper-surface text-paper-ink2 border-paper-line hover:border-paper-ink3"
          }`}
        >
          全部 · {activeDiaries.length}
        </button>
        {moodList.map((m) => {
          const count = moodStats[m.id] ?? 0;
          if (count === 0 && !moodFilter) return null;
          return (
            <button
              key={m.id}
              onClick={() => setMoodFilter(moodFilter === m.id ? null : m.id)}
              className={`shrink-0 h-8 px-3 text-xs font-medium rounded-full border transition flex items-center gap-1.5 ${
                moodFilter === m.id
                  ? "bg-paper-ink text-paper-bg border-paper-ink"
                  : "bg-paper-surface text-paper-ink2 border-paper-line hover:border-paper-ink3"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: m.color }}
              />
              {m.label}
              <span className="opacity-60">· {count}</span>
            </button>
          );
        })}
      </div>

      {/* 日记列表 */}
      <div className="px-4 pt-4 space-y-5">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-paper-surface border border-paper-line flex items-center justify-center">
              <FileText className="w-6 h-6 text-paper-ink3" />
            </div>
            <p className="text-sm text-paper-ink2">
              {search || moodFilter ? "没有匹配的日记" : "还没有日记，点 + 写第一篇吧"}
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.date}>
              <h2 className="text-xs font-semibold text-paper-ink2 mb-2 flex items-center gap-1.5">
                {formatDate({ date: group.date } as Diary)}
                <span className="opacity-60">· {weekdayCN(group.date)} · {group.items.length} 篇</span>
              </h2>
              <div className="space-y-2.5">
                {group.items.map((d) => {
                  const mood = moodById(d.moodId) ?? { color: "#b0a28a" };
                  const imgCount = countImages(d);
                  const audioSec = audioDurationSec(d);
                  const hasImg = hasImage(d);
                  const hasAud = hasAudio(d);
                  return (
                    <button
                      key={d.id}
                      onClick={() => nav(`/editor/${d.id}`)}
                      className="w-full text-left p-3.5 rounded-xl bg-paper-surface border border-paper-line/70 hover:border-paper-ink3 transition active:scale-[0.99] shadow-sm hover:shadow-md"
                    >
                      {/* 头部：心情 + 日期 + 时间 + 箭头 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {mood && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: mood.color }}
                            />
                          )}
                          <span className="text-[11px] text-paper-ink2 font-medium">
                            {formatDate(d)}{formatTime(d.updatedAt)}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-paper-ink3 opacity-60" />
                      </div>

                      {/* 正文：标题 + 摘要 */}
                      <div className="flex gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-semibold text-paper-ink leading-snug truncate">
                            {d.title || firstBlockText(d) || "无标题"}
                          </h3>
                          {firstBlockText(d) && (
                            <p className="text-xs text-paper-ink2 leading-relaxed line-clamp-2 mt-1">
                              {firstBlockText(d)}
                            </p>
                          )}
                        </div>
                        {hasImg && (
                          <div className="shrink-0 w-[52px] h-[52px] rounded-lg bg-paper-line/60 border border-paper-line overflow-hidden flex items-center justify-center">
                            <Image className="w-4 h-4 text-paper-ink3" />
                          </div>
                        )}
                      </div>

                      {/* 底部：标签 + 媒体计数 */}
                      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-paper-line/50">
                        <div className="flex flex-wrap gap-1.5 min-w-0">
                          {d.tags?.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="shrink-0 h-5 px-2 rounded-full bg-paper-line/50 text-[10px] text-paper-ink2 font-medium flex items-center"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 text-paper-ink3">
                          {imgCount > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px]">
                              <Image className="w-3 h-3" /> {imgCount}
                            </span>
                          )}
                          {hasAud && (
                            <span className="flex items-center gap-0.5 text-[11px]">
                              <Volume2 className="w-3 h-3" />
                              {audioSec > 0 ? `${Math.floor(audioSec / 60)}:${String(audioSec % 60).padStart(2, "0")}` : ""}
                            </span>
                          )}
                          {d.blocks.filter((b) => b.kind === "audio").length > 0 && audioSec === 0 && (
                            <span className="flex items-center gap-0.5 text-[11px]">
                              <Mic className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* 右下角 + 浮动按钮 */}
      <button
        onClick={() => nav("/editor")}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-paper-accent text-white shadow-lg shadow-paper-accent/30 hover:shadow-xl hover:scale-105 transition-all active:scale-95 flex items-center justify-center z-40"
        aria-label="写新日记"
      >
        <Plus className="w-7 h-7" strokeWidth={2.2} />
      </button>
    </div>
  );
}
