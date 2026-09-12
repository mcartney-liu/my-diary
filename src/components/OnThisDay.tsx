import type { Diary } from "../types";
import { onThisDay, moodById } from "../data";
import { useNavigate } from "react-router-dom";

interface Props {
  diaries: Diary[];
}

export default function OnThisDay({ diaries }: Props) {
  const entries = onThisDay(diaries);
  const nav = useNavigate();
  if (entries.length === 0) return null;

  const years = entries.length;
  return (
    <div className="card p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎞️</span>
        <span className="font-medium text-paper-ink">On This Day</span>
        <span className="text-xs text-paper-ink2">· 往年的今天</span>
      </div>
      <div className="space-y-2">
        {entries.slice(0, 3).map((d) => {
          const mood = moodById(d.moodId);
          const textBlock = d.blocks.find((b) => b.kind === "text" && b.content.trim());
          const preview = textBlock?.content.slice(0, 50) ?? "(无正文)";
          const year = d.date.slice(0, 4);
          return (
            <button
              key={d.id}
              onClick={() => nav(`/editor/${d.id}`)}
              className="w-full text-left p-3 rounded-xl bg-paper-surface hover:bg-paper-line/50 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-paper-accent">{year}年</span>
                {mood && <span className="text-sm">{mood.icon}</span>}
              </div>
              <div className="text-sm text-paper-ink truncate">
                {d.title || preview}
              </div>
              {!d.title && textBlock && (
                <div className="text-xs text-paper-ink2 truncate mt-0.5">{preview}</div>
              )}
            </button>
          );
        })}
        {years > 3 && (
          <div className="text-center text-xs text-paper-ink2 pt-1">
            还有 {years - 3} 篇...
          </div>
        )}
      </div>
    </div>
  );
}
