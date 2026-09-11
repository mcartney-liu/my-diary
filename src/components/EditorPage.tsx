import { useEffect, useRef, useState } from "react";
import { uid, type Diary, type DiaryBlock } from "../types";
import { today, MOOD_TAGS, moodById } from "../data";
import TextBlock from "./TextBlock";
import ImageBlock from "./ImageBlock";
import AudioBlock from "./AudioBlock";

interface Props {
  initialDiary?: Diary;
  onSave: (d: Diary) => void;
  onDelete: (d: Diary) => void;
  onCancel: () => void;
}

type ShowPicker = "text" | "image" | "audio" | null;

export default function EditorPage({ initialDiary, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(initialDiary?.title ?? "");
  const [date, setDate] = useState(initialDiary?.date ?? today());
  const [moodId, setMoodId] = useState<string | null>(initialDiary?.moodId ?? null);
  const [blocks, setBlocks] = useState<DiaryBlock[]>(() =>
    initialDiary?.blocks ?? [{ id: uid(), kind: "text", content: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [showPicker, setShowPicker] = useState<ShowPicker>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 防抖自动保存（离开时保存）
  const save = async () => {
    setSaving(true);
    const now = Date.now();
    const cleanBlocks = blocks.filter(
      (b) => b.content.trim() !== "" || b.kind !== "text"
    );
    const diary: Diary = {
      id: initialDiary?.id ?? uid("d"),
      title: title.trim(),
      date,
      moodId: moodId as Diary["moodId"],
      blocks: cleanBlocks,
      createdAt: initialDiary?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await onSave(diary);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  // 离开页面前提示保存（如果有改动）
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!initialDiary || blocks.length > 1 || (initialDiary && title !== initialDiary.title)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [initialDiary, blocks, title]);

  const updateBlock = (id: string, patch: Partial<DiaryBlock>) => {
    setBlocks((arr) => arr.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks((arr) => (arr.length > 1 ? arr.filter((b) => b.id !== id) : arr));
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((arr) => {
      const idx = arr.findIndex((b) => b.id === id);
      const ni = idx + dir;
      if (idx < 0 || ni < 0 || ni >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[ni]] = [copy[ni], copy[idx]];
      return copy;
    });
  };

  const addBlock = (kind: DiaryBlock["kind"], content = "") => {
    setBlocks((arr) => [...arr, { id: uid(), kind, content }]);
    setShowPicker(null);
  };

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      addBlock("image", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const mood = moodId ? moodById(moodId) : null;
  const isEdit = !!initialDiary;

  return (
    <div className="min-h-screen paper-bg pb-40">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-paper-bg/80 border-b border-paper-line/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button onClick={onCancel} className="btn-ghost flex items-center gap-1 text-sm">
            ← 返回
          </button>
          <h1 className="text-paper-ink font-semibold text-base md:text-lg truncate">
            {isEdit ? "编辑日记" : "新日记"}
          </h1>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex items-center gap-1 text-sm shrink-0"
          >
            {saving ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-paper-bg/40 border-t-paper-bg rounded-full animate-spin" />
            ) : (
              "保存"
            )}
          </button>
        </div>
      </header>

      {/* Saved toast */}
      {savedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 animate-scale-in">
          <div className="bg-paper-ink text-paper-bg text-sm px-4 py-2 rounded-card shadow-card">
            ✓ 已保存
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 pt-4">
        {/* 日记头部 meta */}
        <section className="card p-4 md:p-6 mb-4 space-y-4 animate-fade-up">
          {/* 标题 */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给今天起个标题..."
            className="w-full text-xl md:text-2xl font-semibold text-paper-ink placeholder:text-paper-ink3 outline-none bg-transparent border-0"
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {/* 日期 */}
            <label className="flex items-center gap-2 text-paper-ink2">
              <span>📅</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-paper-surface border border-paper-line rounded-lg px-2 py-1 text-paper-ink outline-none focus:border-paper-accent"
              />
            </label>

            {/* 心情选择 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-paper-ink2">心情</span>
              <div className="flex gap-1.5">
                {MOOD_TAGS.map((m) => {
                  const selected = moodId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMoodId(selected ? null : m.id)}
                      title={m.name}
                      className={[
                        "w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-base md:text-lg",
                        "transition-all",
                        selected
                          ? "ring-2 ring-paper-ink scale-110 shadow-card"
                          : "opacity-70 hover:opacity-100 hover:scale-105",
                      ].join(" ")}
                      style={{ backgroundColor: m.color + "50" }}
                    >
                      {m.icon}
                    </button>
                  );
                })}
              </div>
              {mood && (
                <span className="text-xs text-paper-ink2 italic">{mood.name}</span>
              )}
            </div>
          </div>
        </section>

        {/* Blocks 编辑器 */}
        <section className="card paper-editor p-4 md:p-6 md:p-8 min-h-[300px] space-y-2 md:space-y-3 animate-fade-up" style={{ animationDelay: "60ms" }}>
          {blocks.map((b, i) => (
            <div key={b.id} className="group/block relative animate-fade-up">
              {/* 块控制按钮 — hover 出现 */}
              {blocks.length > 1 && (
                <div className="absolute -left-12 top-2 hidden md:flex flex-col gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveBlock(b.id, -1)}
                    disabled={i === 0}
                    className="w-6 h-6 rounded bg-paper-surface hover:bg-paper-line text-paper-ink2 disabled:opacity-30 text-xs"
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveBlock(b.id, 1)}
                    disabled={i === blocks.length - 1}
                    className="w-6 h-6 rounded bg-paper-surface hover:bg-paper-line text-paper-ink2 disabled:opacity-30 text-xs"
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeBlock(b.id)}
                    className="w-6 h-6 rounded bg-paper-surface hover:bg-red-100 text-red-400 hover:text-red-600 text-xs"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 根据 kind 渲染块 */}
              {b.kind === "text" && (
                <TextBlock
                  block={b}
                  onChange={(c) => updateBlock(b.id, { content: c })}
                  onEnter={() => addBlock("text", "")}
                />
              )}
              {b.kind === "image" && (
                <ImageBlock block={b} onChange={(c) => updateBlock(b.id, { content: c })} />
              )}
              {b.kind === "audio" && (
                <AudioBlock block={b} onChange={(c, dur) => updateBlock(b.id, { content: c, durationMs: dur })} />
              )}
            </div>
          ))}
        </section>

        {/* 添加块按钮 */}
        <section className="mt-4 mb-6 flex items-center justify-center gap-2 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <button
            onClick={() => setShowPicker((s) => (s === "text" ? null : "text"))}
            className={pickerBtnCls(showPicker === "text")}
          >
            <span>✏️</span> 文字
          </button>
          <button
            onClick={() => setShowPicker((s) => (s === "image" ? null : "image"))}
            className={pickerBtnCls(showPicker === "image")}
          >
            <span>🖼️</span> 图片
          </button>
          <button
            onClick={() => setShowPicker((s) => (s === "audio" ? null : "audio"))}
            className={pickerBtnCls(showPicker === "audio")}
          >
            <span>🎙️</span> 录音
          </button>

          {/* 真正的添加动作 */}
          {showPicker === "text" && (
            <button
              onClick={() => addBlock("text", "")}
              className="btn-primary ml-2 animate-fade-in"
            >
              + 添加文字块
            </button>
          )}
          {showPicker === "image" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageFile(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary ml-2 animate-fade-in"
              >
                + 添加图片
              </button>
            </>
          )}
          {showPicker === "audio" && (
            <button
              onClick={() => addBlock("audio", "")}
              className="btn-primary ml-2 animate-fade-in"
            >
              + 添加录音
            </button>
          )}
        </section>

        {/* 编辑模式下 — 删除按钮 */}
        {isEdit && (
          <section className="mb-8 animate-fade-up" style={{ animationDelay: "180ms" }}>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-sm text-red-500 hover:text-red-700 w-full py-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
              >
                🗑️ 删除这篇日记
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="btn-ghost flex-1"
                >
                  再想想
                </button>
                <button
                  onClick={() => initialDiary && onDelete(initialDiary)}
                  className="flex-1 py-2 rounded-card bg-red-500 text-white font-medium hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  确认删除
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 底部悬浮保存按钮 — 移动端友好 */}
      <div className="fixed bottom-4 left-0 right-0 z-20 px-4 md:hidden">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary w-full py-3 text-base shadow-cardHover"
        >
          {saving ? "保存中..." : "💾 保存日记"}
        </button>
      </div>
    </div>
  );
}

function pickerBtnCls(active: boolean) {
  return [
    "px-3 py-1.5 md:px-3 md:py-2 rounded-card text-sm transition-all border",
    active
      ? "bg-paper-ink text-paper-bg border-paper-ink shadow-soft"
      : "bg-paper-surface text-paper-ink2 border-paper-line hover:border-paper-accent hover:text-paper-ink",
  ].join(" ");
}
