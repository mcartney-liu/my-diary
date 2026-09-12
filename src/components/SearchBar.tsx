import { useMemo, useState } from "react";
import type { Diary, MoodId } from "../types";
import { searchDiaries, MOOD_TAGS, moodById } from "../data";
import { useNavigate } from "react-router-dom";

interface Props {
  diaries: Diary[];
}

export default function SearchBar({ diaries }: Props) {
  const [kw, setKw] = useState("");
  const [moodFilter, setMoodFilter] = useState<MoodId | null>(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const results = useMemo(
    () => searchDiaries(diaries, kw, moodFilter),
    [diaries, kw, moodFilter]
  );

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line cursor-text active:bg-paper-line/30"
        onClick={() => setOpen(true)}
      >
        <span className="text-paper-ink2">🔍</span>
        <input
          readOnly
          value={kw}
          placeholder="搜索日记..."
          className="flex-1 bg-transparent outline-none text-sm text-paper-ink placeholder:text-paper-ink2/50"
        />
        {kw && <span className="text-xs text-paper-ink2">{results.length} 条</span>}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 animate-[fade-in_0.15s]"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute top-0 left-0 right-0 bg-paper-card shadow-2xl rounded-b-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索输入 */}
            <div className="p-3 border-b border-paper-line">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line">
                <span>🔍</span>
                <input
                  autoFocus
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder="搜索标题或正文..."
                  className="flex-1 bg-transparent outline-none text-sm"
                />
                {kw && (
                  <button onClick={() => setKw("")} className="text-paper-ink2 text-sm">✕</button>
                )}
              </div>
              {/* 心情过滤 */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                {MOOD_TAGS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMoodFilter(moodFilter === m.id ? null : m.id as MoodId)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs border transition ${
                      moodFilter === m.id
                        ? "bg-paper-accent/20 border-paper-accent text-paper-ink"
                        : "border-paper-line text-paper-ink2"
                    }`}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 结果 */}
            <div className="flex-1 overflow-y-auto">
              {!kw && !moodFilter && (
                <div className="p-8 text-center text-paper-ink2 text-sm">
                  输入关键词或选个心情开始搜索
                </div>
              )}
              {(kw || moodFilter) && results.length === 0 && (
                <div className="p-8 text-center text-paper-ink2 text-sm">
                  没找到匹配的日记 🤷
                </div>
              )}
              {results.map((d) => {
                const mood = moodById(d.moodId);
                const textBlock = d.blocks.find((b) => b.kind === "text" && b.content.trim());
                const preview = textBlock?.content.slice(0, 80) ?? "(无正文)";
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      setOpen(false);
                      nav(`/editor/${d.id}`);
                    }}
                    className="w-full text-left px-4 py-3 border-b border-paper-line/60 hover:bg-paper-surface transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-paper-ink2">{d.date}</span>
                      {mood && <span className="text-xs">{mood.icon}</span>}
                    </div>
                    <div className="font-medium text-paper-ink text-sm truncate">
                      {d.title || "(无标题)"}
                    </div>
                    <div className="text-xs text-paper-ink2 mt-0.5 line-clamp-2">
                      {preview}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
