import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2, CheckSquare, Square } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";

interface Props {
  diaries: Diary[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onBatchRestore: (ids: string[]) => void;
  onBatchPermanentDelete: (ids: string[]) => void;
}

function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

function firstBlockText(d: Diary): string {
  return d.blocks.find((b) => b.kind === "text")?.content.trim().slice(0, 80) ?? "";
}

export default function TrashPage({ diaries, onRestore, onPermanentDelete, onBatchRestore, onBatchPermanentDelete }: Props) {
  const nav = useNavigate();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() =>
    [...diaries].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [diaries]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = sorted.length > 0 && selected.size === sorted.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((d) => d.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBatchRestore = () => {
    if (selected.size === 0) return;
    if (confirm(`恢复选中的 ${selected.size} 篇日记？`)) {
      onBatchRestore([...selected]);
      exitSelectMode();
    }
  };

  const handleBatchDelete = () => {
    if (selected.size === 0) return;
    if (confirm(`永久删除选中的 ${selected.size} 篇日记？无法恢复！`)) {
      onBatchPermanentDelete([...selected]);
      exitSelectMode();
    }
  };

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => {
              if (selectMode) exitSelectMode();
              else nav("/", { replace: true });
            }}
            className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
          >
            <ArrowLeft size={20} className="text-paper-ink" />
          </button>
          <h1 className="text-base text-paper-ink font-medium">🗑️ 回收站</h1>
          {selectMode ? (
            <span className="text-xs text-paper-ink2 ml-auto">已选 {selected.size}</span>
          ) : (
            <span className="text-xs text-paper-ink2 ml-auto">{sorted.length} 条</span>
          )}
          {sorted.length > 0 && !selectMode && (
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs text-paper-accent hover:underline ml-2"
            >
              选择
            </button>
          )}
          {selectMode && (
            <button
              onClick={exitSelectMode}
              className="text-xs text-paper-ink2 hover:underline ml-2"
            >
              完成
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-32">
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
              const checked = selected.has(d.id);
              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                    checked ? "bg-paper-accent/10 border-paper-accent" : "bg-paper-surface border-paper-line/70"
                  }`}
                >
                  {selectMode && (
                    <button
                      onClick={() => toggleSelect(d.id)}
                      className="shrink-0 text-paper-accent active:scale-90"
                    >
                      {checked ? <CheckSquare size={20} /> : <Square size={20} className="text-paper-ink3" />}
                    </button>
                  )}
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
                      <h3 className="font-medium text-paper-ink2 truncate">
                        {d.title || (mood ? mood.name : "无题")}
                      </h3>
                      <span className="text-[10px] text-paper-ink3 shrink-0">{d.date}</span>
                    </div>
                    <p className="text-xs text-paper-ink3 truncate">
                      {firstBlockText(d) || "（仅图片/录音）"}
                    </p>
                    <div className="text-[10px] text-paper-ink3 mt-0.5">
                      {days === 0 ? "今天删除" : `${days} 天前删除`}
                      {canRestore ? ` · 剩 ${30 - days} 天可恢复` : " · 超过 30 天将被自动清理"}
                    </div>
                  </div>
                  {!selectMode && (
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 批量操作栏 */}
      {selectMode && sorted.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-paper-line bg-[#faf6ef]/95 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-paper-accent hover:underline shrink-0"
            >
              {allSelected ? "取消全选" : "全选"}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleBatchRestore}
              disabled={selected.size === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              恢复 {selected.size || ""}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selected.size === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              删除 {selected.size || ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
