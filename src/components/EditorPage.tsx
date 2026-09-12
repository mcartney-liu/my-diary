import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, Save, Mic, ImagePlus, FileText, Smile, Loader2, FileAudio, Music, Bot } from "lucide-react";
import type { Diary, DiaryBlock, MoodId } from "../types";
import { uid } from "../types";
import { MOOD_TAGS, moodById, today, PROMPTS } from "../data";
import { transcribeAudio } from "../api";
import { fetchWeather, fetchLocation } from "../weather";
import TextBlock from "./TextBlock";
import ImageBlock from "./ImageBlock";
import AudioBlock from "./AudioBlock";
import GridSnap from "./GridSnap";

interface Props {
  initialDiary?: Diary;
  onSave: (d: Diary) => Promise<void>;
  onSoftDelete: (d: Diary) => void;
  onCancel: () => void;
}

interface PendingRecording {
  blob: Blob;
  dataUrl: string;
  durationMs: number;
  speechText?: string; // Web Speech API 实时转写结果（可编辑后落字）
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

export default function EditorPage({ initialDiary, onSave, onSoftDelete, onCancel }: Props) {
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
  const [tags, setTags] = useState<string[]>(initialDiary?.tags ?? []);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");

  // 添加标签（支持逗号/分号/空格分隔批量）
  const addTag = () => {
    const raw = tagInput.trim();
    if (!raw) return;
    const cleanList = raw
      .split(/[,，;；\s]+/)
      .map((s) => s.trim().replace(/^#+/, ""))
      .filter((s) => s.length > 0);
    setTags((prev) => {
      const set = new Set(prev);
      for (const c of cleanList) set.add(c);
      return Array.from(set);
    });
    setTagInput("");
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const savedIdRef = useRef<string | null>(initialDiary?.id ?? null);
  const toastTimerRef = useRef<number | null>(null);
  const prompt = promptForDate(date);

  // Web Speech API（浏览器原生语音转写，PM-OS 同款）
  const speechRecRef = useRef<any>(null);
  const speechStreamRef = useRef<MediaStream | null>(null);
  const recordingStartRef = useRef(0);
  const speechFinalRef = useRef<string>("");
  const pendingSpeechTextRef = useRef<string>(""); // stopRecording 存的转写文字，等 MediaRecorder onstop 合并
  const [speechInterim, setSpeechInterim] = useState("");
  const [speechSupported] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
  );
  // 弹窗里可编辑的转写文字（初始值来自 pendingSpeechTextRef）
  const [editableTranscript, setEditableTranscript] = useState("");

  // 标签弹框 outside-click 关闭
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTagInput) return;
    const handler = (e: MouseEvent) => {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setShowTagInput(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTagInput]);

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

  // 当切换到不同的日记时（initialDiary 从 undefined → 有值，或 id 变化），
  // 同步所有 state 到最新的 initialDiary 字段
  useEffect(() => {
    if (!initialDiary) return;
    setTitle(initialDiary.title ?? "");
    setMoodId(initialDiary.moodId ?? null);
    setBlocks(
      initialDiary.blocks?.length
        ? initialDiary.blocks
        : [{ id: uid("b"), kind: "text" as const, content: "" }]
    );
    setWeather(initialDiary.weather ?? null);
    setLocation(initialDiary.location ?? null);
    setTags(initialDiary.tags ?? []);
    setCapsuleDays(null);
  }, [initialDiary?.id]);

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

  // 图片压缩：长边≤1280px，JPEG quality=0.85 → 通常从 3MB 降到 200-400KB
  const compressImage = (file: File, maxEdge = 1280, quality = 0.85): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const scale = Math.min(maxEdge / Math.max(width, height), 1);
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas 不可用")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // 统一存 JPEG（比 PNG 小 5-10 倍），保留 EXIF 无关紧要
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const handleImagePick = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      addBlock("image", compressed);
    } catch {
      // fallback：压缩失败就存原始
      const reader = new FileReader();
      reader.onload = () => addBlock("image", reader.result as string);
      reader.readAsDataURL(file);
    }
  };
  const handleAudioPick = async (file: File) => {
    // 音频不做浏览器端压缩（成本高），以后接 FFmpeg.wasm 再说
    const reader = new FileReader();
    reader.onload = () => addBlock("audio", reader.result as string);
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    speechFinalRef.current = "";
    setSpeechInterim("");

    // 1) 申请麦克风权限
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      speechStreamRef.current = stream;
    } catch {
      alert("无法访问麦克风，请检查权限或改用上方📎上传录音文件");
      return;
    }

    // 2) Web Speech API 实时转写（支持就用它，PM-OS 同款）
    if (speechSupported) {
      const SR = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
      const rec = new SR();
      rec.lang = "zh-CN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) speechFinalRef.current += res[0].transcript;
          else interim += res[0].transcript;
        }
        setSpeechInterim(interim);
      };
      rec.onerror = (e: any) => console.warn("[mydiary] speechRec:", e.error);
      rec.start();
      speechRecRef.current = rec;
    }

    // 3) 同时录一份音频做备份
    try {
      const mimeCandidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mime = mimeCandidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const durationMs = Date.now() - recordingStartRef.current;
        const speechText = pendingSpeechTextRef.current;
        pendingSpeechTextRef.current = ""; // 用完清
        const reader = new FileReader();
        reader.onload = () => {
          const rec: PendingRecording = { blob, dataUrl: reader.result as string, durationMs };
          if (speechText) {
            rec.speechText = speechText;
            setEditableTranscript(speechText); // 初始化弹窗可编辑文字
          } else {
            setEditableTranscript("");
          }
          setPendingRec(rec);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
    } catch (e) {
      console.warn("[mydiary] MediaRecorder 不可用，仅语音转写:", e);
    }

    recordingStartRef.current = Date.now();
    setRecording(true);
  };

  const stopRecording = () => {
    const speechText = (speechFinalRef.current.trim() + " " + speechInterim.trim()).trim();

    // 停 Web Speech
    try { speechRecRef.current?.stop(); } catch {}
    speechRecRef.current = null;
    // 停 MediaRecorder（它的 onstop 回调会 setPendingRec）
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    // 停麦克风
    speechStreamRef.current?.getTracks().forEach((t) => t.stop());
    speechStreamRef.current = null;
    setRecording(false);
    setSpeechInterim("");

    // 不自动落字！把 speechText 塞进一个临时 ref，等 MediaRecorder onstop 合并进 pendingRec
    // 这样弹窗里可以同时看到音频播放器 + 可编辑的转写文字
    pendingSpeechTextRef.current = speechText;
  };

  // 弹窗里的按钮动作
  const confirmSaveAudioAndText = () => {
    if (!pendingRec) return;
    const text = editableTranscript.trim();
    addBlock("audio", pendingRec.dataUrl, pendingRec.durationMs);
    if (text) addBlock("text", text);
    cancelPending();
  };
  const confirmSaveTextOnly = () => {
    if (!pendingRec) return;
    const text = editableTranscript.trim();
    if (text) addBlock("text", text);
    cancelPending();
  };
  const confirmSaveAudioOnly = () => {
    if (!pendingRec) return;
    addBlock("audio", pendingRec.dataUrl, pendingRec.durationMs);
    cancelPending();
  };
  const confirmRerunAI = async () => {
    if (!pendingRec) return;
    const rec = pendingRec;
    setTranscribing(true);
    try {
      const text = await transcribeAudio(rec.blob);
      if (text.trim()) setEditableTranscript(text.trim());
    } catch (err) {
      console.warn("AI 转写失败:", err);
      alert("AI 转写失败");
    } finally {
      setTranscribing(false);
    }
  };
  const cancelPending = () => {
    setPendingRec(null);
    setEditableTranscript("");
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

    // 扫描正文中的 #xxx hashtag → 自动合并到 tags（去重）
    const hashtagRegex = /#([\p{L}\p{N}_\-]+)/gu;
    const bodyText = finalBlocks
      .filter((b) => b.kind === "text")
      .map((b) => b.content)
      .join(" ");
    const extractedTags = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = hashtagRegex.exec(bodyText)) !== null) {
      extractedTags.add(m[1]);
    }
    const mergedTags = Array.from(new Set([...tags, ...extractedTags]));

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
      tags: mergedTags.length > 0 ? mergedTags : undefined,
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
    if (confirm("删除后会进入回收站，30 天内可恢复。确定要删除吗？")) onSoftDelete(initialDiary);
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
                capsuleDays || isLocked
                  ? "bg-amber-100 border-amber-300 text-amber-800"
                  : "border-paper-line bg-paper-surface text-paper-ink2 hover:bg-paper-line/50"
              }`}
            >
              🔒 {isLocked
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

          {/* 标签按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowTagInput((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition ${
                tags.length > 0
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "border-paper-line bg-paper-surface text-paper-ink2 hover:bg-paper-line/50"
              }`}
            >
              🏷️ {tags.length > 0 ? `${tags.length} 个标签` : "标签"}
            </button>
            {showTagInput && (
              <div
                ref={tagPopoverRef}
                className="absolute top-full mt-1 right-0 z-30 bg-paper-card rounded-xl shadow-xl border border-paper-line p-3 w-56 animate-[fade-in_0.15s]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] text-paper-ink2 px-1 mb-1.5 flex items-center justify-between">
                  <span>回车添加 · 正文写 #xxx 自动识别</span>
                  <button
                    onClick={() => setShowTagInput(false)}
                    className="hover:text-paper-ink text-paper-ink3"
                    aria-label="关闭"
                  >✕</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 border border-emerald-200">
                      #{t}
                      <button
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className="hover:text-red-600 font-bold"
                      >×</button>
                    </span>
                  ))}
                  {tags.length === 0 && <span className="text-xs text-paper-ink3 italic">还没有标签</span>}
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-paper-line bg-paper-surface focus-within:border-paper-accent">
                   <span className="pl-2 text-emerald-600 text-xs font-medium select-none">#</span>
                   <input
                     type="text"
                     value={tagInput}
                     enterKeyHint="done"
                     onChange={(e) => setTagInput(e.target.value)}
                     onBlur={() => {
                       if (tagInput.trim()) addTag();
                     }}
                     onKeyDown={(e) => {
                       if (e.key === "Enter" && tagInput.trim()) {
                         e.preventDefault();
                         addTag();
                       } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                         setTags((prev) => prev.slice(0, -1));
                       }
                     }}
                     placeholder="标签名（多个用逗号分隔）"
                     className="flex-1 px-1 py-1.5 text-xs bg-transparent outline-none"
                     autoFocus
                   />
                   <button
                     onClick={addTag}
                     disabled={!tagInput.trim()}
                     className="mr-1 px-2 py-1 text-[11px] rounded-md bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                   >
                     添加
                   </button>
                 </div>
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
              <GridSnap minRows={2}><ImageBlock block={b} onRemove={() => removeBlock(b.id)} /></GridSnap>
            )}
            {b.kind === "audio" && (
              <GridSnap minRows={3}><AudioBlock block={b} onRemove={() => removeBlock(b.id)} /></GridSnap>
            )}
            {idx === blocks.length - 1 && <div className="h-6" />}
          </div>
          ))}

           {/* Web Speech API 实时转写区（正文区，跟着内容滚动） */}
           {recording && speechSupported && (
             <div className="px-4 md:px-6 mt-2">
               <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                 <div className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1.5">
                   <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                   正在录音… 实时转写中
                 </div>
                 <div className="text-red-900 leading-relaxed text-sm min-h-[24px]">
                   {speechFinalRef.current.split(/(?<=[。！？，])/).filter(Boolean).join(" ") || ""}
                   {speechInterim && <span className="text-red-400 italic">{speechInterim}</span>}
                   {!speechFinalRef.current && !speechInterim && <span className="text-red-300 italic">开始说话…</span>}
                 </div>
               </div>
             </div>
           )}
         </div>
       </div>

       {/* 录音完成弹窗 — 微信风格：音频 + 可编辑转写 */}
       {pendingRec && (
         <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-6 animate-[fade-in_0.2s]">
           <div className="bg-paper-card rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
             <div className="text-center">
               <div className="text-lg font-medium text-paper-ink">🎙️ 录音完成</div>
               <div className="text-sm text-paper-ink2 mt-1">时长 {fmtDuration(pendingRec.durationMs)}</div>
             </div>

             {/* 音频播放器 */}
             <div className="rounded-xl bg-paper-surface p-3">
               <audio src={pendingRec.dataUrl} controls className="w-full" />
             </div>

             {/* 可编辑转写文字（Web Speech 实时转写结果，用户可改） */}
             {pendingRec.speechText !== undefined || editableTranscript ? (
               <div>
                 <div className="text-xs text-paper-accent font-medium mb-1.5 flex items-center gap-1.5">
                    <FileText size={13} /> 语音转文字（可编辑）
                  </div>
                 <textarea
                   value={editableTranscript}
                   onChange={(e) => setEditableTranscript(e.target.value)}
                   rows={4}
                   placeholder="没有识别出文字"
                   className="w-full px-3 py-2 text-sm bg-paper-surface border border-paper-line rounded-xl outline-none focus:border-paper-accent resize-none text-paper-ink leading-relaxed"
                 />
               </div>
             ) : (
               <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                 💡 当前浏览器不支持实时语音转写。保存音频后可用「🤖 AI 转写」按钮重新识别。
               </div>
             )}

             <div className="space-y-2 pt-1">
               {editableTranscript.trim() && (
                 <button
                   onClick={confirmSaveTextOnly}
                   className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm font-medium hover:bg-paper-line/50 active:scale-95 transition flex items-center justify-center gap-2"
                 >
                   <FileText size={16} /> 仅保留文字
                 </button>
               )}
               <button
                 onClick={confirmSaveAudioAndText}
                 className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm font-medium hover:bg-paper-line/50 active:scale-95 transition flex items-center justify-center gap-2"
               >
                 <FileAudio size={16} /> 保留音频 + 文字
               </button>
               <button
                 onClick={confirmSaveAudioOnly}
                 className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm font-medium hover:bg-paper-line/50 active:scale-95 transition flex items-center justify-center gap-2"
               >
                 <Music size={16} /> 仅保留音频
               </button>
               {!speechSupported && (
                 <button
                   onClick={confirmRerunAI}
                   disabled={transcribing}
                   className="w-full py-2.5 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm hover:bg-paper-line/50 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                   <Bot size={16} /> {transcribing ? "AI 识别中..." : "AI 重新转写"}
                 </button>
               )}
              <button
                onClick={cancelPending}
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

           {/* 录音按钮：点一下切换录音状态，长按也支持 */}
           <RecordingButton
             recording={recording}
             disabled={transcribing || !!pendingRec}
             onToggle={() => recording ? stopRecording() : startRecording()}
           />
         </div>
       </footer>
     </div>
   );
 }

// 录音按钮组件 — 支持点击切换 + 长按停止
function RecordingButton({
  recording,
  disabled,
  onToggle,
}: {
  recording: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const pressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const handleDown = () => {
    if (disabled) return;
    longPressedRef.current = false;
    // 300ms 后判定为"长按"→ 自动开始录音
    pressTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      if (!recording) onToggle(); // 长按 = 开始录
    }, 300);
  };

  const handleUp = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (longPressedRef.current) {
      // 长按模式：松开 = 停止录音
      if (recording) onToggle();
      longPressedRef.current = false;
      return;
    }
    // 点击模式：<300ms 点一下 = 切换（开/关）
    onToggle();
  };

  return (
    <button
      onMouseDown={handleDown}
      onMouseUp={handleUp}
      onMouseLeave={() => {
        if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
        if (recording && longPressedRef.current) onToggle();
      }}
      onTouchStart={(e) => { e.preventDefault(); handleDown(); }}
      onTouchEnd={(e) => { e.preventDefault(); handleUp(); }}
      onTouchCancel={() => {
        if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
        if (recording && longPressedRef.current) onToggle();
        longPressedRef.current = false;
      }}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition active:scale-95 select-none ${
        recording ? "bg-red-500 text-white border-red-500 animate-pulse" :
        disabled ? "bg-paper-surface border-paper-line text-paper-ink/40 cursor-not-allowed" :
        "bg-paper-surface border-paper-line text-paper-ink hover:bg-paper-line/50"
      }`}
    >
      <Mic size={16} />
      {recording ? "停止录音" : "点按录音"}
    </button>
  );
}
