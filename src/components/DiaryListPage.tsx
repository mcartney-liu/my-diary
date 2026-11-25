import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search, X, Volume2, Image, Mic } from "lucide-react";
import type { Diary } from "../types";
import { moodById, MOOD_TAGS } from "../data";
import { templateById } from "../templates";
import BottomDock from "./BottomDock";
import { MemoriesHeader } from "./MemoriesSwitch";
import LifeLinks from "./LifeLinks";
import EmptyState from "./EmptyState";

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
  const [templateFilter, setTemplateFilter] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<"all" | "with-media">("all");

  const activeDiaries = useMemo(
    () => diaries.filter((d) => !d.deletedAt),
    [diaries]
  );

  // 搜索 + 心情 + 模板 + 媒体筛选
  const filtered = useMemo(() => {
    let list = activeDiaries;

    if (moodFilter) list = list.filter((d) => (d.moodId ?? "neutral") === moodFilter);
    if (templateFilter === "__capsule") list = list.filter((d) => !!d.capsuleUnlockAt);
    else if (templateFilter) list = list.filter((d) => (d.templateId || "diary") === templateFilter);
    if (mediaFilter === "with-media") {
      list = list.filter((d) => d.blocks.some((b) => b.kind === "image" || b.kind === "audio"));
    }

    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter((d) => {
        if (d.title?.toLowerCase().includes(kw)) return true;
        const text = d.blocks
          .filter((b) => b.kind === "text")
          .map((b) => b.content)
          .join(" ")
          .toLowerCase();
        if (text.includes(kw)) return true;
        if (d.tags?.some((t) => t.toLowerCase().includes(kw))) return true;
        return false;
      });
    }

    return list;
  }, [activeDiaries, moodFilter, templateFilter, mediaFilter, search]);

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

  // 类型：按实际写过的模板统计，没写过的类型不显示（旧版写死了 7 个，其中几个 id 和真实模板对不上，点了永远是空）
  const typeList = useMemo(() => {
    const count: Record<string, number> = {};
    let capsule = 0;
    for (const d of activeDiaries) {
      const t = d.templateId || "diary";
      count[t] = (count[t] ?? 0) + 1;
      if (d.capsuleUnlockAt) capsule++;
    }
    const list = Object.entries(count)
      .map(([id, n]) => {
        const tpl = templateById(id);
        const custom = id.startsWith("custom-");
        return { id, n, label: tpl?.name ?? (custom ? "自定义" : id), icon: tpl?.icon ?? (custom ? "🧩" : "📄") };
      })
      .sort((a, b) => b.n - a.n);
    if (capsule) list.push({ id: "__capsule", n: capsule, label: "时光胶囊", icon: "🫧" });
    return list;
  }, [activeDiaries]);
  const mediaCount = useMemo(
    () => activeDiaries.filter((d) => d.blocks.some((b) => b.kind === "image" || b.kind === "audio")).length,
    [activeDiaries]
  );
  const hasFilter = !!(moodFilter || templateFilter || mediaFilter === "with-media" || search.trim());
  const clearFilters = () => { setMoodFilter(null); setTemplateFilter(null); setMediaFilter("all"); setSearch(""); };
  const filterLabel = [
    moodFilter ? `${moodById(moodFilter)?.icon ?? ""} ${moodById(moodFilter)?.name ?? ""}` : "",
    templateFilter ? (() => { const t = typeList.find((x) => x.id === templateFilter); return t ? `${t.icon} ${t.label}` : ""; })() : "",
    mediaFilter === "with-media" ? "📎 有图/语音" : "",
    search.trim() ? `"${search.trim()}"` : "",
  ].filter(Boolean).join(" + ");

  const today = new Date();
  const todayDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const todayWeekday = weekdayCN(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      <MemoriesHeader current="timeline" subtitle={`${todayDate} 星期${todayWeekday} · 共 ${totalCount} 篇`}>
        {/* 搜索 */}
        <div className="mt-3 flex items-center gap-2 h-10 px-3 rounded-xl bg-paper-card border border-paper-line/70 focus-within:border-paper-accent transition">
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

        {/* 筛选：心情 / 类型 各一行，左边带标题；每项显示篇数，没有的不显示 */}
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-8 text-[11px] text-paper-ink3">心情</span>
            <div className="-mr-4 pr-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setMoodFilter(null)}
                className={`shrink-0 h-7 px-2.5 text-xs rounded-full border transition flex items-center gap-1 ${moodFilter === null ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"}`}
              >
                全部
              </button>
              {MOOD_TAGS.map((m) => {
                const count = moodStats[m.id] ?? 0;
                if (count === 0 && moodFilter !== m.id) return null;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMoodFilter(moodFilter === m.id ? null : m.id)}
                    className={`shrink-0 h-7 px-2.5 text-xs rounded-full border transition flex items-center gap-1 ${moodFilter === m.id ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"}`}
                  >
                    {m.icon} {m.name}<span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-8 text-[11px] text-paper-ink3">类型</span>
            <div className="-mr-4 pr-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => { setTemplateFilter(null); setMediaFilter("all"); }}
                className={`shrink-0 h-7 px-2.5 text-xs rounded-full border transition flex items-center gap-1 ${templateFilter === null && mediaFilter !== "with-media" ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"}`}
              >
                全部
              </button>
              {typeList.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateFilter(templateFilter === t.id ? null : t.id)}
                  className={`shrink-0 h-7 px-2.5 text-xs rounded-full border transition flex items-center gap-1 ${templateFilter === t.id ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"}`}
                >
                  {t.icon} {t.label}<span className="opacity-60">{t.n}</span>
                </button>
              ))}
              {mediaCount > 0 && (
                <button
                  onClick={() => setMediaFilter(mediaFilter === "with-media" ? "all" : "with-media")}
                  className={`shrink-0 h-7 px-2.5 text-xs rounded-full border transition flex items-center gap-1 ${mediaFilter === "with-media" ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"}`}
                >
                  📎 有图/语音<span className="opacity-60">{mediaCount}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </MemoriesHeader>

      {/* 日记列表 */}
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-5">
        {hasFilter && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-xs">
            <span className="min-w-0 truncate text-amber-900">找到 <b>{filtered.length}</b> 篇 · {filterLabel}</span>
            <button onClick={clearFilters} className="shrink-0 px-2 py-0.5 rounded-full text-amber-800 hover:bg-amber-100">清除筛选</button>
          </div>
        )}
        {grouped.length === 0 ? (
          hasFilter
            ? <EmptyState mood="thinking" title="没有符合条件的日记" hint="换个心情或类型试试" action={<button className="btn-secondary !h-8 !text-xs" onClick={clearFilters}>清除筛选</button>} />
            : <EmptyState mood="cheer" title="还没有日记" hint="写下第一篇，小麦会一直帮你记着" action={<button className="btn-primary !h-8 !text-xs" onClick={() => nav("/editor")}>写第一篇</button>} />
        ) : (
          grouped.map((group) => (
            <section key={group.date}>
              <h2 className="px-1 pt-1 text-xs font-semibold text-paper-ink2 mb-2 flex items-center gap-1.5">
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
                      className="w-full text-left p-4 card hover:shadow-cardHover transition active:scale-[0.99]"
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
                          // 直接显示第一张照片（原来只是一个"有图"的图标）
                          <img
                            src={d.blocks.find((b) => b.kind === "image" && b.content)?.content}
                            alt=""
                            loading="lazy"
                            className="shrink-0 w-[72px] h-[72px] rounded-xl object-cover border border-paper-line/60"
                          />
                        )}
                      </div>

                      {/* 小麦关联的人物 / 地点 */}
                      <LifeLinks diaryId={d.id} max={3} className="mt-2" />

                      {/* 底部：标签 + 媒体计数 */}
                      {((d.tags?.length ?? 0) > 0 || imgCount > 0 || hasAud) && (
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
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Tab 页：底栏常驻 */}
      <BottomDock active="memories" />
    </div>
  );
}
