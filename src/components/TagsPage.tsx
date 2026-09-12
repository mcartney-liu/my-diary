import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Hash } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";

interface Props {
  diaries: Diary[];
}

function firstBlockText(d: Diary): string {
  const t = d.blocks.find((b) => b.kind === "text")?.content.trim() ?? "";
  return t.length > 50 ? t.slice(0, 50) + "…" : t;
}

export default function TagsPage({ diaries }: Props) {
  const nav = useNavigate();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 统计每个标签出现次数 + 含该标签的日记
  const tagStats = useMemo(() => {
    const map = new Map<string, { count: number; diaries: Diary[] }>();
    for (const d of diaries) {
      for (const t of (d.tags ?? [])) {
        const existing = map.get(t);
        if (existing) {
          existing.count++;
          existing.diaries.push(d);
        } else {
          map.set(t, { count: 1, diaries: [d] });
        }
      }
    }
    return Array.from(map.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [diaries]);

  const selected = selectedTag ? tagStats.find((t) => t.tag === selectedTag) : null;
  const untagged = diaries.filter((d) => !d.tags || d.tags.length === 0);

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => { setSelectedTag(null); nav("/", { replace: true }); }}
            className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
          >
            <ArrowLeft size={20} className="text-paper-ink" />
          </button>
          <h1 className="text-base text-paper-ink font-medium">🏷️ 标签</h1>
          <span className="text-xs text-paper-ink2 ml-auto">{tagStats.length} 个标签</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-5">
        {/* 标签云 */}
        {selected === null && (
          <>
            {tagStats.length === 0 && untagged.length === diaries.length && (
              <div className="py-16 text-center">
                <div className="text-5xl mb-3">🏷️</div>
                <p className="text-paper-ink2">还没有任何标签</p>
                <p className="text-xs text-paper-ink3 mt-1">编辑日记时点 🏷️ 按钮添加标签</p>
              </div>
            )}

            {tagStats.length > 0 && (
              <div>
                <h2 className="text-xs text-paper-ink2 mb-2 px-1">所有标签 · 按使用次数排序</h2>
                <div className="flex flex-wrap gap-2">
                  {tagStats.map(({ tag, count }) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm hover:bg-emerald-100 transition active:scale-95"
                    >
                      <Hash size={12} />
                      {tag}
                      <span className="text-xs text-emerald-600/80">×{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 未分类日记 */}
            {untagged.length > 0 && (
              <div>
                <h2 className="text-xs text-paper-ink2 mb-2 px-1">未分类（{untagged.length}）</h2>
                <ul className="space-y-2">
                  {untagged.slice(0, 5).map((d) => (
                    <li
                      key={d.id}
                      onClick={() => nav(`/editor/${d.id}`)}
                      className="p-3 rounded-xl bg-paper-surface/60 border border-transparent hover:border-paper-line cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {moodById(d.moodId)?.icon}
                        <span className="font-medium text-paper-ink truncate">
                          {d.title || moodById(d.moodId)?.name || "无题"}
                        </span>
                        <span className="text-xs text-paper-ink2 ml-auto shrink-0">{d.date}</span>
                      </div>
                      <p className="text-xs text-paper-ink2 mt-0.5 line-clamp-1">{firstBlockText(d)}</p>
                    </li>
                  ))}
                  {untagged.length > 5 && (
                    <li className="text-xs text-paper-ink3 text-center py-1">
                      还有 {untagged.length - 5} 条未分类日记
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        {/* 选中标签 — 显示该标签下所有日记 */}
        {selected && (
          <>
            <button
              onClick={() => setSelectedTag(null)}
              className="text-xs text-paper-ink2 hover:text-paper-ink"
            >
              ← 返回标签列表
            </button>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-800">
              <Hash size={18} /> {selected.tag}
              <span className="text-xs text-paper-ink2 font-normal">{selected.count} 篇</span>
            </h2>
            <ul className="space-y-2">
              {[...selected.diaries]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((d) => {
                  const mood = moodById(d.moodId);
                  return (
                    <li
                      key={d.id}
                      onClick={() => nav(`/editor/${d.id}`)}
                      className="p-3 rounded-xl bg-paper-surface/60 border border-transparent hover:border-paper-line cursor-pointer transition animate-fade-up"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {mood?.icon && (
                          <span className="text-base" style={{ backgroundColor: (mood.color || "#fff") + "30" }}></span>
                        )}
                        <span className="font-medium text-paper-ink truncate">
                          {d.title || mood?.name || "无题"}
                        </span>
                        <span className="text-xs text-paper-ink2 ml-auto shrink-0">{d.date}</span>
                      </div>
                      <p className="text-xs text-paper-ink2 mt-0.5 line-clamp-2">{firstBlockText(d)}</p>
                      {d.tags && d.tags.length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {d.tags.filter((t) => t !== selected.tag).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] bg-paper-line/40 text-paper-ink2">#{t}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
