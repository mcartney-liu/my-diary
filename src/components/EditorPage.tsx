import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, Save, Mic, ImagePlus, FileText, Smile, Loader2 } from "lucide-react";
import type { Diary, DiaryBlock, MoodId } from "../types";
import { uid } from "../types";
import { MOOD_TAGS, moodById, today, PROMPTS } from "../data";
import { transcribeAudio } from "../api";
import { fetchWeather, fetchLocation } from "../weather";
import TextBlock from "./TextBlock";
import ImageBlock from "./ImageBlock";
import AudioBlock from "./AudioBlock";

interface Props {
  initialDiary?: Diary;
  onSave: (d: Diary) => Promise<void>;
  onDelete: (d: Diary) => void;
  onCancel: () => void;
}

interface PendingRecording {
  blob: Blob;
  dataUrl: string;
  durationMs: number;
}

function dateStr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const cn = ["日", "一", "二", "三", "四", "五", "六"];
  const w = new Date(y, m - 1, d).getDay();
  return `${y} 年 ${m} 月 ${d} 日 · 周${cn[w]}`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}分${r}秒` : `${m}分`;
}

function promptForDate(dateStr: string): string {
  // 用日期哈希固定同一天的 prompt，每天换
  const [y, m, d] = dateStr.split("-").map(Number);
  const seed = (y * 1000 + m * 50 + d) % PROMPTS.length;
  return PROMPTS[seed];
}

export default function EditorPage({ initialDiary, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(initialDiary?.title ?? "");
  const [date] = useState(initialDiary?.date ?? today());
  const [moodId, setMoodId] = useState<MoodId | null>(initialDiary?.moodId ?? null);
  const [blocks, setBlocks] = useState<DiaryBlock[]>(
    initialDiary?.blocks?.length ? initialDiary.blocks : [{ id: uid("b"), kind: "text" as const, content: "" }]
  );
  const [showMood, setShowMood] = useState(false);
  const [weather, setWeather] = useState(initialDiary?.weather ?? null);
  const [location, setLocation] = useState(initialDiary?.location ?? null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [capsuleDays, setCapsuleDays] = useState<number | null>(null);
  const [showCapsuleMenu, setShowCapsuleMenu] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [pendingRec, setPendingRec] = useState<PendingRecording | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const savedIdRef = useRef<string | null>(initialDiary?.id ?? null);
  const toastTimerRef = useRef<number | null>(null);
  const prompt = promptForDate(date);

  // 自动抓天气 + 位置（仅新建日记时）
  useEffect(() => {
    if (initialDiary) return; // 编辑模式不自动抓
    let cancelled = false;
    (async () => {
      setWeatherLoading(true);
      try {
        const loc = await fetchLocation();
        if (cancelled) return;
        if (loc) {
          setLocation({ name: loc.name, lat: loc.lat, lon: loc.lon });
          const w = await fetchWeather(loc.lat, loc.lon);
          if (!cancelled && w) setWeather(w);
        } else {
          const w = await fetchWeather(); // 默认北京
          if (!cancelled && w) setWeather(w);
        }
      } catch { /* ignore */ }
      setWeatherLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initialDiary]);

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
      const mimeCandidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mime = mimeCandidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const durationMs = Date.now() - startTime;
        const reader = new FileReader();
        reader.onload = () => {
          setPendingRec({ blob, dataUrl: reader.result as string, durationMs });
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

  const confirmAudioOnly = () => {
    if (!pendingRec) return;
    addBlock("audio", pendingRec.dataUrl, pendingRec.durationMs);
    setPendingRec(null);
  };
  const confirmAudioAndTranscribe = async () => {
    if (!pendingRec) return;
    const rec = pendingRec;
    setPendingRec(null);
    addBlock("audio", rec.dataUrl, rec.durationMs);
    setTranscribing(true);
    try {
      const text = await transcribeAudio(rec.blob);
      if (text.trim()) addBlock("text", text.trim());
    } catch (err) {
      console.warn("转文字失败:", err);
      alert("AI 转写失败，仅保存了音频。请确认 Worker 已部署且 Whisper 可用。");
    } finally {
      setTranscribing(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return; // 防重复
    const now = Date.now();
    const cleaned = blocks.filter((b) => {
      if (b.kind === "text") return b.content.trim().length > 0;
      return !!b.content;
    });
    const finalBlocks: DiaryBlock[] = cleaned.length ? cleaned : [{ id: uid("b"), kind: "text" as const, content: "" }];

    const capsuleUnlockAt = capsuleDays
      ? now + capsuleDays * 24 * 60 * 60 * 1000
      : initialDiary?.capsuleUnlockAt;

    // 新建日记第一次保存 → 生成 id 并记住；后续保存复用同一 id
    const id = initialDiary?.id ?? savedIdRef.current ?? uid("d");
    if (!savedIdRef.current) savedIdRef.current = id;

    const diary: Diary = {
      id,
      title: title.trim(),
      date,
      moodId,
      blocks: finalBlocks,
      weather: weather ?? undefined,
      location: location ?? undefined,
      promptId: capsuleDays ? `capsule-${capsuleDays}d` : undefined,
      capsuleUnlockAt,
      createdAt: initialDiary?.createdAt ?? now,
      updatedAt: now,
    };
    setSaving(true);
    savingRef.current = true;
    setSaveToast(true);
    // toast 2 秒后自动消失
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setSaveToast(false), 2000);
    try {
      await onSave(diary);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleDelete = () => {
    if (!initialDiary) { onCancel(); return; }
    if (confirm("确定要删除这篇日记吗？")) onDelete(initialDiary);
  };

  const hasContent = title.trim() || blocks.some((b) =>
    b.kind === "text" ? b.content.trim().length > 0 : !!b.content
  );

  const isLocked = !!(initialDiary?.capsuleUnlockAt && initialDiary.capsuleUnlockAt > Date.now());

  // 被 capsule 锁定的日记 → 显示封存页面，不让编辑/查看正文
  if (isLocked && initialDiary) {
    const msLeft = initialDiary.capsuleUnlockAt! - Date.now();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    const hoursLeft = Math.ceil((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return (
      <div className="min-h-screen bg-[#faf6ef] flex flex-col">
        <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center">
            <button
              onClick={onCancel}
              className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
            >
              <ArrowLeft size={20} className="text-paper-ink" />
            </button>
            <div className="ml-2 text-sm text-paper-ink font-medium">封存中</div>
          </div>
        </header>
        <div className="flex-1 max-w-md w-full mx-auto px-6 py-16 flex flex-col items-center text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-xl font-semibold text-amber-800 mb-2">时间胶囊封存中</h1>
          <p className="text-sm text-amber-700/70 mb-6 leading-relaxed">
            这篇日记被你锁进了时间胶囊，<br />
            只有等到解封之日才能看到内容。
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-8 py-5 mb-6">
            <div className="text-3xl font-bold text-amber-700">
              {daysLeft} <span className="text-base font-normal text-amber-600">天</span>
            </div>
            <div className="text-xs text-amber-600/70 mt-1">
              再加 {hoursLeft} 小时 · 解锁于 {new Date(initialDiary.capsuleUnlockAt!).toLocaleDateString("zh-CN")}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-full bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition active:scale-95"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6ef] flex flex-col">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={() => {
              // 有内容 + 从未保存过（新建模式）才弹警告；编辑模式或已保存过直接放行
              if (hasContent && !initialDiary && !savedIdRef.current) { alert("请先保存再离开"); return; }
              onCancel();
            }}
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
              disabled={saving || saveToast}
              className={`flex items-center gap-1 bg-paper-ink text-paper-bg rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-95 ${
                (saving || saveToast) ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"
              }`}
            >
              <Save size={14} /> {saveToast ? "已保存 ✓" : saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </header>

      {/* 保存成功 toast */}
      {saveToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-green-500/95 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-[fade-in_0.3s]">
          ✓ 已保存
        </div>
      )}

      <div className="max-w-2xl w-full mx-auto px-4 pt-1">
        {/* 标题 */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题..."
          className="w-full text-2xl font-bold text-paper-ink placeholder:text-paper-ink2/50 bg-transparent outline-none py-2"
        />

        {/* 只读日期 + 心情 + 天气胶囊 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-sm text-paper-ink2">{dateStr(date)}</span>

          {/* 天气/位置 chip */}
          {weatherLoading && <span className="text-xs text-paper-ink2 animate-pulse">📍 定位中...</span>}
          {weather && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-paper-surface border border-paper-line">
              <span>{weather.icon}</span>
              <span className="text-paper-ink">{weather.temp}°</span>
              {location?.name && <span className="text-paper-ink2">· {location.name}</span>}
            </span>
          )}

          {/* 心情按钮 */}
          <button
            onClick={() => setShowMood((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm"
          >
            {moodId ? (
              <>{moodById(moodId)!.icon} {moodById(moodId)!.name}</>
            ) : (
              <><Smile size={14} /> 选择心情</>
            )}
          </button>

          {/* 时间胶囊 */}
          <div className="relative">
            <button
              onClick={() => setShowCapsuleMenu((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition ${
                capsuleDays || todayCapsuleUnlock
                  ? "bg-amber-100 border-amber-300 text-amber-800"
                  : "border-paper-line bg-paper-surface text-paper-ink2 hover:bg-paper-line/50"
              }`}
            >
              🔒 {todayCapsuleUnlock
                ? `解锁中 ${Math.ceil((initialDiary!.capsuleUnlockAt! - Date.now()) / 86400000)}天`
                : capsuleDays ? `${capsuleDays}天后解锁` : "时间胶囊"}
            </button>
            {showCapsuleMenu && (
              <div
                className="absolute top-full mt-1 right-0 z-30 bg-paper-card rounded-xl shadow-xl border border-paper-line p-2 w-44 animate-[fade-in_0.15s]"
                onClick={() => setShowCapsuleMenu(false)}
              >
                <div className="text-[10px] text-paper-ink2 px-2 py-1">保存后锁定，到期才能看</div>
                {[7, 30, 90, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => setCapsuleDays(capsuleDays === d ? null : d)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition ${
                      capsuleDays === d ? "bg-amber-100 text-amber-800" : "hover:bg-paper-surface text-paper-ink"
                    }`}
                  >
                    🔒 {d === 7 ? "一周" : d === 30 ? "一个月" : d === 90 ? "三个月" : "一年"}后解锁
                  </button>
                ))}
                {capsuleDays && (
                  <button
                    onClick={() => setCapsuleDays(null)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-paper-ink2 hover:bg-paper-surface"
                  >
                    取消胶囊
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 每日 Prompt 卡片（新建日记时显示） */}
        {!initialDiary && blocks.every((b) => b.kind === "text" && !b.content.trim()) && (
          <div className="mt-3 p-3 rounded-xl border border-dashed border-paper-accent/40 bg-paper-accent/5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">💡</span>
              <span className="text-xs text-paper-accent font-medium">今日写作提示</span>
            </div>
            <div className="text-sm text-paper-ink">{prompt}</div>
          </div>
        )}

        {/* 心情选择 */}
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
            {idx === blocks.length - 1 && <div className="h-6" />}
          </div>
          ))}
        </div>
      </div>

      {/* 录音后选择弹窗 */}
      {pendingRec && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-6 animate-[fade-in_0.2s]">
          <div className="bg-paper-card rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="text-center">
              <div className="text-lg font-medium text-paper-ink">🎙️ 录音完成</div>
              <div className="text-sm text-paper-ink2 mt-1">时长 {fmtDuration(pendingRec.durationMs)}</div>
            </div>
            <div className="rounded-xl bg-paper-surface p-3">
              <audio src={pendingRec.dataUrl} controls className="w-full" />
            </div>
            <div className="space-y-2">
              <button
                onClick={confirmAudioAndTranscribe}
                className="w-full py-3 rounded-xl bg-paper-ink text-paper-bg text-sm font-medium hover:opacity-90 active:scale-95 transition"
              >
                ✨ 保存 + AI 转写文字
              </button>
              <button
                onClick={confirmAudioOnly}
                className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm hover:bg-paper-line/50 active:scale-95 transition"
              >
                🎵 仅保存音频
              </button>
              <button
                onClick={() => setPendingRec(null)}
                className="w-full py-2 rounded-xl text-paper-ink2 text-sm hover:bg-paper-surface active:scale-95"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 转写 loading */}
      {transcribing && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center animate-[fade-in_0.2s] pointer-events-none">
          <div className="bg-paper-card rounded-2xl shadow-2xl px-6 py-5 flex items-center gap-3">
            <Loader2 size={20} className="text-paper-accent animate-spin" />
            <span className="text-sm text-paper-ink">AI 正在听你说了什么...</span>
          </div>
        </div>
      )}

      {/* 底部添加栏 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#faf6ef]/95 backdrop-blur border-t border-paper-line">
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
            disabled={transcribing || !!pendingRec}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition active:scale-95 ${
              recording ? "bg-red-500 text-white border-red-500 animate-pulse" :
              transcribing ? "bg-amber-100 border-amber-300 text-amber-700 cursor-wait" :
              "bg-paper-surface border-paper-line text-paper-ink disabled:opacity-50"
            }`}
          >
            <Mic size={16} />
            {recording ? "松开停止录音" : transcribing ? "AI 转写中..." : "按住录音"}
          </button>
        </div>
      </footer>
    </div>
  );
}
