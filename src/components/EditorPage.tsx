import { useRef, useState } from "react";
import { ArrowLeft, Trash2, Save, Mic, ImagePlus, FileText, Smile } from "lucide-react";
import type { Diary, DiaryBlock, MoodId } from "../types";
import { uid } from "../types";
import { MOOD_TAGS, moodById, today } from "../data";
import TextBlock from "./TextBlock";
import ImageBlock from "./ImageBlock";
import AudioBlock from "./AudioBlock";

interface Props {
  initialDiary?: Diary;
  onSave: (d: Diary) => void;
  onDelete: (d: Diary) => void;
  onCancel: () => void;
}

function dateStr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const cn = ["日", "一", "二", "三", "四", "五", "六"];
  const w = new Date(y, m - 1, d).getDay();
  return `${y} 年 ${m} 月 ${d} 日 · 周${cn[w]}`;
}

export default function EditorPage({ initialDiary, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(initialDiary?.title ?? "");
  const [date] = useState(initialDiary?.date ?? today());
  const [moodId, setMoodId] = useState<MoodId | null>(initialDiary?.moodId ?? null);
  const [blocks, setBlocks] = useState<DiaryBlock[]>(
    initialDiary?.blocks?.length ? initialDiary.blocks : [{ id: uid("b"), kind: "text" as const, content: "" }]
  );
  const [showMood, setShowMood] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const updateBlock = (id: string, patch: Partial<DiaryBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeBlock = (id: string) => {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      return next.length ? next : [{ id: uid("b"), kind: "text" as const, content: "" }];
    });
  };
  const addBlock = (kind: DiaryBlock["kind"], content = "", durationMs?: number) => {
    const block: DiaryBlock = { id: uid(kind[0]), kind, content, durationMs };
    setBlocks((prev) => [...prev, block]);
  };

  const handleImagePick = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => addBlock("image", reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAudioPick = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => addBlock("audio", reader.result as string);
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) recordedChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const durationMs = Date.now() - startTime;
        const reader = new FileReader();
        reader.onload = () => {
          addBlock("audio", reader.result as string, durationMs);
          stream.getTracks().forEach((t) => t.stop());
        };
        reader.readAsDataURL(blob);
      };
      const startTime = Date.now();
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert("无法访问麦克风，请检查权限或改用上方📎上传录音文件");
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const handleSave = () => {
    const now = Date.now();
    const cleaned = blocks.filter((b) => {
      if (b.kind === "text") return b.content.trim().length > 0;
      return !!b.content;
    });
    const finalBlocks: DiaryBlock[] = cleaned.length ? cleaned : [{ id: uid("b"), kind: "text" as const, content: "" }];

    const diary: Diary = {
      id: initialDiary?.id ?? uid("d"),
      title: title.trim(),
      date,
      moodId,
      blocks: finalBlocks,
      createdAt: initialDiary?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(diary);
  };

  const handleDelete = () => {
    if (!initialDiary) { onCancel(); return; }
    if (confirm("确定要删除这篇日记吗？")) onDelete(initialDiary);
  };

  const hasContent = title.trim() || blocks.some((b) =>
    b.kind === "text" ? b.content.trim().length > 0 : !!b.content
  );

  return (
    <div className="min-h-screen bg-paper-bg flex flex-col">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 bg-paper-bg/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={() => { if (hasContent && !initialDiary) { alert("请先保存再离开"); return; } onCancel(); }}
            className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
          >
            <ArrowLeft size={20} className="text-paper-ink" />
          </button>
          <div className="text-sm text-paper-ink font-medium">
            {initialDiary ? "编辑日记" : "新建日记"}
          </div>
          <div className="flex items-center gap-1">
            {initialDiary && (
              <button onClick={handleDelete} className="p-2 rounded-full hover:bg-red-50 active:scale-95">
                <Trash2 size={18} className="text-red-500" />
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1 bg-paper-ink text-paper-bg rounded-full px-4 py-1.5 text-sm font-medium hover:opacity-90 active:scale-95 transition"
            >
              <Save size={14} /> 保存
            </button>
          </div>
        </div>
      </header>

      {/* 标题 */}
      <div className="max-w-2xl w-full mx-auto px-4 pt-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题..."
          className="w-full text-2xl font-bold text-paper-ink placeholder:text-paper-ink2/50 bg-transparent outline-none py-2"
        />
        {/* 只读日期 + 心情 */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-sm text-paper-ink2">
            {dateStr(date)}
          </span>
          <button
            onClick={() => setShowMood((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm"
          >
            {moodId ? (
              <>{moodById(moodId)!.icon} {moodById(moodId)!.name}</>
            ) : (
              <><Smile size={14} /> 选择心情</>
            )}
          </button>
        </div>

        {showMood && (
          <div className="pt-2 pb-3 flex gap-2 flex-wrap">
            {MOOD_TAGS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMoodId(m.id); setShowMood(false); }}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  moodId === m.id ? "ring-2 ring-paper-accent border-paper-accent" : "border-paper-line hover:bg-paper-surface"
                }`}
                style={{ backgroundColor: moodId === m.id ? m.color : undefined }}
              >
                {m.icon} {m.name}
              </button>
            ))}
            {moodId && (
              <button
                onClick={() => setMoodId(null)}
                className="px-3 py-1.5 rounded-full text-sm border border-paper-line text-paper-ink2 hover:bg-paper-surface"
              >
                清除
              </button>
            )}
          </div>
        )}
      </div>

      {/* 块列表 — 信纸区域 */}
      <div className="max-w-2xl w-full mx-auto px-4 pb-24">
        <div className="paper-editor rounded-card shadow-card min-h-[200px]">
          {blocks.map((b, idx) => (
          <div key={b.id} className="block-enter px-4 md:px-6">
            {b.kind === "text" && (
              <TextBlock block={b} onChange={(c) => updateBlock(b.id, { content: c })} onRemove={() => removeBlock(b.id)} />
            )}
            {b.kind === "image" && (
              <ImageBlock block={b} onRemove={() => removeBlock(b.id)} />
            )}
            {b.kind === "audio" && (
              <AudioBlock block={b} onRemove={() => removeBlock(b.id)} />
            )}
            {idx === blocks.length - 1 && (
              <div className="h-6" />
            )}
          </div>
          ))}
        </div>
      </div>

      {/* 底部添加栏 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-paper-bg/95 backdrop-blur border-t border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImagePick(e.target.files[0])} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAudioPick(e.target.files[0])} />

          <button onClick={() => addBlock("text")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line text-sm text-paper-ink hover:bg-paper-line/50 active:scale-95">
            <FileText size={16} /> 文字
          </button>
          <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line text-sm text-paper-ink hover:bg-paper-line/50 active:scale-95">
            <ImagePlus size={16} /> 图片
          </button>

          <button
            onMouseDown={recording ? stopRecording : startRecording}
            onTouchStart={(e) => { e.preventDefault(); recording ? stopRecording() : startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); if (recording) stopRecording(); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition active:scale-95 ${
              recording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-paper-surface border-paper-line text-paper-ink"
            }`}
          >
            <Mic size={16} />
            {recording ? "松开停止录音" : "按住录音"}
          </button>
        </div>
      </footer>
    </div>
  );
}
