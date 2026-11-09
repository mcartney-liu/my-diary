import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Hash, Pencil, Trash2, Merge } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";
import { upsertDiary } from "../api";

interface Props {
  diaries: Diary[];
  onDiariesChange?: (diaries: Diary[]) => void;
}

function firstBlockText(d: Diary): string {
  const t = d.blocks.find((b) => b.kind === "text")?.content.trim() ?? "";
  return t.length > 50 ? t.slice(0, 50) + "…" : t;
}

export default function TagsPage({ diaries, onDiariesChange }: Props) {
  const nav = useNavigate();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

  // 内部改标签后 → 本地状态 + Worker 同步
  const updateDiaryTagField = async (updater: (tags: string[]) => string[]) => {
    if (!onDiariesChange) return;
    // 乐观改本地状态
    const next = diaries.map((d) => ({ ...d, tags: updater(d.tags ?? []) }));
    onDiariesChange(next);
    // 异步 Worker 同步（只改了 tags 的日记）
    for (const oldD of diaries) {
      const newTags = updater(oldD.tags ?? []);
      const oldTags = oldD.tags ?? [];
      if (JSON.stringify(newTags) !== JSON.stringify(oldTags)) {
        const newDiary = { ...oldD, tags: newTags };
        upsertDiary(newDiary).catch(() => {});
      }
    }
  };

  const handleDeleteTag = async (tag: string) => {
    if (!confirm(`确定删除标签 #${tag}？所有日记里的这个标签都会被移除。`)) return;
    await updateDiaryTagField((tags) => tags.filter((t) => t !== tag));
    if (selectedTag === tag) setSelectedTag(null);
  };

  const handleRenameTag = async (tag: string) => {
    const newName = prompt(`把 #${tag} 改名为：`, tag);
    if (!newName || !newName.trim() || newName === tag) return;
    await updateDiaryTagField((tags) => tags.map((t) => (t === tag ? newName.trim() : t)));
    if (selectedTag === tag) setSelectedTag(newName.trim());
  };

  const handleMergeTag = async (tagA: string) => {
    const others = tagStats.filter((t) => t.tag !== tagA).map((t) => t.tag);
    if (others.length === 0) { alert("至少需要两个标签才能合并"); return; }
    const msg = `把 #${tagA} 合并到哪个标签？\n\n可选：${others.map((o, i) => `${i + 1}. #${o}`).join("\n")}`;
    const answer = prompt(msg);
    if (!answer) return;
    const idx = parseInt(answer.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= others.length) { alert("请输入正确的序号"); return; }
    const target = others[idx];
    await updateDiaryTagField((tags) => {
      const filtered = tags.filter((t) => t !== tagA);
      if (!filtered.includes(target)) filtered.push(target);
      return filtered;
    });
    if (selectedTag === tagA) setSelectedTag(target);
  };

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
        <p className="text-xs text-paper-ink3">
          给日记打上标签，按主题检索——比如 #健身 #旅行 #读书笔记
        </p>

        {/* 标签云 */}
        {selected === null && (
          <>
            {tagStats.length === 0 && untagged.length === diaries.length && (
              <div className="py-12 text-center">
                <div className="text-5xl mb-3">🏷️</div>
                <p className="text-paper-ink2">还没有任何标签</p>
              </div>
            )}

            {tagStats.length > 0 && (
              <div>
                <h2 className="text-xs text-paper-ink2 mb-2 px-1">所有标签 · 按使用次数排序</h2>
                <div className="flex flex-wrap gap-2">
                  {tagStats.map(({ tag, count }) => (
                    <div
                      key={tag}
                      className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm hover:bg-emerald-100 transition"
                    >
                      <button onClick={() => setSelectedTag(tag)} className="flex items-center gap-1.5">
                        <Hash size={12} />
                        {tag}
                        <span className="text-xs text-emerald-600/80">×{count}</span>
                      </button>
                      {onDiariesChange && (
                        <div className="hidden group-hover:flex items-center gap-0.5 ml-1 pl-1 border-l border-emerald-300/50">
                          <button
                            onClick={() => handleRenameTag(tag)}
                            className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-200/50 rounded p-0.5"
                            title="重命名"
                          ><Pencil size={11} /></button>
                          {tagStats.length > 1 && (
                            <button
                              onClick={() => handleMergeTag(tag)}
                              className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-200/50 rounded p-0.5"
                              title="合并到..."
                            ><Merge size={11} /></button>
                          )}
                          <button
                            onClick={() => handleDeleteTag(tag)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-100 rounded p-0.5"
                            title="删除标签"
                          ><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {onDiariesChange && (
                  <p className="text-[10px] text-paper-ink3 mt-1.5">💡 鼠标悬停标签可看到 重命名 / 合并 / 删除</p>
                )}
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
