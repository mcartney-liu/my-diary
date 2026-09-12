import { useState } from "react";
import type { Diary } from "../types";
import { onThisDay, moodById } from "../data";
import { useNavigate } from "react-router-dom";

interface Props {
  diaries: Diary[];
}

export default function OnThisDay({ diaries }: Props) {
  const entries = onThisDay(diaries);
  const nav = useNavigate();
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, 3);
  const hidden = entries.length - 3;

  return (
    <div className="card p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎞️</span>
        <span className="font-medium text-paper-ink">On This Day</span>
        <span className="text-xs text-paper-ink2">· 往年的今天</span>
        <span className="ml-auto text-xs text-paper-ink2">{entries.length} 年</span>
      </div>
      <div className="space-y-2">
        {visible.map((d) => {
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
        {hidden > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full text-center text-xs text-paper-accent hover:text-paper-accent/80 pt-1 py-2 rounded-lg hover:bg-paper-surface transition"
          >
            还有 {hidden} 篇 · 点击展开 ↓
          </button>
        )}
        {expanded && hidden > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full text-center text-xs text-paper-ink2 hover:text-paper-ink pt-1 py-2 rounded-lg hover:bg-paper-surface transition"
          >
            收起 ↑
          </button>
        )}
      </div>
    </div>
  );
}
