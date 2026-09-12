import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";

interface Props {
  diaries: Diary[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}

function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

function firstBlockText(d: Diary): string {
  return d.blocks.find((b) => b.kind === "text")?.content.trim().slice(0, 80) ?? "";
}

export default function TrashPage({ diaries, onRestore, onPermanentDelete }: Props) {
  const nav = useNavigate();
  const sorted = useMemo(() =>
    [...diaries].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [diaries]
  );

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => nav("/", { replace: true })}
            className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
          >
            <ArrowLeft size={20} className="text-paper-ink" />
          </button>
          <h1 className="text-base text-paper-ink font-medium">🗑️ 回收站</h1>
          <span className="text-xs text-paper-ink2 ml-auto">{sorted.length} 条</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {sorted.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">🗑️</div>
            <p className="text-paper-ink2">回收站是空的</p>
            <p className="text-xs text-paper-ink3 mt-1">删除的日记会在这里保留 30 天</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((d) => {
              const days = daysSince(d.deletedAt ?? Date.now());
              const mood = moodById(d.moodId);
              const canRestore = days <= 30;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200/70"
                >
                  {mood && (
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0 opacity-70"
                      style={{ backgroundColor: mood.color + "30" }}
                    >
                      {mood.icon}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-700 truncate">
                        {d.title || (mood ? mood.name : "无题")}
                      </h3>
                      <span className="text-[10px] text-gray-400 shrink-0">{d.date}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {firstBlockText(d) || "（仅图片/录音）"}
                    </p>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {days === 0 ? "今天删除" : `${days} 天前删除`}
                      {canRestore ? ` · 剩 ${30 - days} 天可恢复` : " · 超过 30 天将被自动清理"}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canRestore && (
                      <button
                        onClick={() => { if (confirm("恢复这篇日记？")) onRestore(d.id); }}
                        title="恢复"
                        className="p-2 rounded-lg hover:bg-emerald-50 active:scale-90 text-emerald-600"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm("永久删除无法恢复，确定吗？")) onPermanentDelete(d.id); }}
                      title="永久删除"
                      className="p-2 rounded-lg hover:bg-red-50 active:scale-90 text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
