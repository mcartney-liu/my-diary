import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowLeft, Trash2, Save, Mic, ImagePlus, FileText, Smile, Loader2, FileAudio, Music, Bot, Palette, LayoutTemplate, MapPin, RefreshCw, Plus } from "lucide-react";
import type { Diary, DiaryBlock, MoodId } from "../types";
import { uid } from "../types";
import { MOOD_TAGS, moodById, today, PROMPTS } from "../data";
import { transcribeAudio } from "../api";
import { polishTranscript } from "../ai";
import { fetchWeather, fetchLocation, fetchLocationAuto, type LocationResult } from "../weather";
import { fetchNearbyPois, type Poi } from "../services/poi";
import TextBlock from "./TextBlock";
import ImageBlock from "./ImageBlock";
import AudioBlock from "./AudioBlock";
import { PRESET_PAPERS, matchPreset } from "../presetPapers";
import { TEMPLATES, templateById } from "../templates";
import { categoriesByDir,  } from "../categories";
import GridSnap from "./GridSnap";
import ConfirmDialog from "./ConfirmDialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function gpsFailedMessage(err?: LocationResult["gpsError"]): string {
  switch (err) {
    case "timeout": return "GPS 超时，IP 定位也失败了。点右侧重试或检查权限";
    case "denied": return "定位权限被拒绝，在浏览器设置里允许后重试";
    case "unavailable": return "此设备无 GPS 模块";
    default: return "定位失败，点右侧重试";
  }
}

interface Props {
  initialDiary?: Diary;
  initialTemplateId?: string;
  initialPolished?: {
    title?: string;
    blocks?: DiaryBlock[];
    moodId?: MoodId;
    tags?: string[];
  };
  onSave: (d: Diary) => Promise<void>;
  onSoftDelete: (d: Diary) => void;
  onCancel: () => void;
  allDiaries?: Diary[];  // 记账月汇总需要
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

// 🔑 可拖拽的 block 壳 — handle 模式
// setNodeRef 给 block（排序列表锚点），listeners 只给把手（触发点）
// → block 内容区域正常交互，只有把手能触发拖拽
function SortableBlock({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // 手机触摸时临时显示把手（iOS 无 hover，用 touch 模拟）
  const [showHandle, setShowHandle] = useState(false);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  // 触摸时显示把手 3 秒后自动隐藏
  const handleTouchStart = useCallback(() => {
    setShowHandle(true);
    window.setTimeout(() => setShowHandle(false), 3000);
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onTouchStart={handleTouchStart}
      className={`relative group ${isDragging ? "shadow-lg rounded-lg" : ""}`}
    >
      {/* 拖拽把手 — 默认隐藏
          桌面: hover/focus 显示
          手机: onTouchStart 显示 3 秒
          拖拽中: 始终可见 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={`absolute -left-2 top-4 w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing select-none z-10
                    transition-opacity duration-150
                    ${isDragging || showHandle
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        style={{
          WebkitTouchCallout: "none",
          userSelect: "none",
          touchAction: "none",
        }}
        aria-label="拖动排序"
      >
        <span className={`text-base leading-none ${isDragging ? "text-paper-accent" : "text-paper-ink3"}`}>⋮⋮</span>
      </button>
      {children}
    </div>
  );
}

export default function EditorPage({ initialDiary, initialTemplateId, initialPolished, onSave, onSoftDelete, onCancel, allDiaries }: Props) {
  const [title, setTitle] = useState(initialPolished?.title ?? initialDiary?.title ?? "");
  const [date] = useState(initialDiary?.date ?? today());
  const [moodId, setMoodId] = useState<MoodId | null>(initialPolished?.moodId ?? initialDiary?.moodId ?? null);
  const [blocks, setBlocksRaw] = useState<DiaryBlock[]>(() => {
    const raw = initialPolished?.blocks?.length
      ? initialPolished.blocks
      : initialDiary?.blocks?.length
        ? initialDiary.blocks
        : [{ id: uid("b"), kind: "text" as const, content: "" }];
    // 初始值也走 normalize，避免历史数据里有相邻 text block
    const out: DiaryBlock[] = [];
    for (const b of raw) {
      if (b.kind === "text" && out.length && out[out.length - 1].kind === "text") {
        const last = out[out.length - 1];
        const sep = last.content && b.content ? "\n" : "";
        out[out.length - 1] = { ...last, content: (last.content + sep + b.content).trim() };
      } else {
        out.push({ ...b });
      }
    }
    while (out.length > 1 && out[out.length - 1].kind === "text" && !out[out.length - 1].content.trim()) out.pop();
    if (out[out.length - 1].kind !== "text") out.push({ id: uid("t"), kind: "text" as const, content: "" });
    return out;
  });

  // normalizeBlocks — 清理 blocks 数组，保证：
  // 1. 没有相邻的 text block（合并成一个，用 \n 分隔）
  // 2. 没有空 text block（除了最后一个可以是空的让用户继续写）
  // 3. 数组最后一定有一个 text block（如果全是 media 或空数组就补一个）
  const normalizeBlocks = (arr: DiaryBlock[]): DiaryBlock[] => {
    if (!arr.length) return [{ id: uid("b"), kind: "text", content: "" }];
    const out: DiaryBlock[] = [];
    for (const b of arr) {
      if (b.kind === "text") {
        if (out.length && out[out.length - 1].kind === "text") {
          // 合并到上一个 text block（如果有内容就加 \n）
          const last = out[out.length - 1];
          const sep = last.content && b.content ? "\n" : "";
          out[out.length - 1] = { ...last, content: (last.content + sep + b.content).trim() };
        } else {
          out.push({ ...b });
        }
      } else {
        out.push({ ...b });
      }
    }
    // 去掉末尾的空 text block（保留至少一个）
    while (out.length > 1 && out[out.length - 1].kind === "text" && !out[out.length - 1].content.trim()) {
      out.pop();
    }
    // 确保最后一个是 text block
    if (out[out.length - 1].kind !== "text") {
      out.push({ id: uid("t"), kind: "text", content: "" });
    }
    return out;
  };

  // wrapper: 所有 setBlocks 调用都走这个，自动 normalize
  const setBlocks = (updater: DiaryBlock[] | ((prev: DiaryBlock[]) => DiaryBlock[])) => {
    setBlocksRaw((prev) => {
      const next = typeof updater === "function" ? (updater as (p: DiaryBlock[]) => DiaryBlock[])(prev) : updater;
      return normalizeBlocks(next);
    });
  };

  // 🔑 dnd-kit 拖拽配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 移动 5px 才触发拖拽，避免跟滚动冲突
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // 🔑 直接 setBlocksRaw，跳过 normalize — reorder 不会产生相邻 text block，normalize 反而会干扰
    setBlocksRaw((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }
  const [showMood, setShowMood] = useState(false);
  const [weather, setWeather] = useState(initialDiary?.weather ?? null);
  const [location, setLocation] = useState(initialDiary?.location ?? null);
  const [locationSource, setLocationSource] = useState<LocationResult["source"] | null>(null);
  const [locationError, setLocationError] = useState<LocationResult["gpsError"]>();
  const [locationLoading, setLocationLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [nearbyPois, setNearbyPois] = useState<Poi[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyAbortRef, setNearbyAbortRef] = useState<AbortController | null>(null);

  // === 手机调试面板 ===
  const _debugOpen = useState(false); void _debugOpen;
  const _debugLogs = useState<{ t: string; msg: string; level: "info" | "warn" | "error" }[]>([]); void _debugLogs;
  const pushLog = (msg: string, level: "info" | "warn" | "error" = "info") => {
        // setDebugLogs removed
    // 同时写到 console（电脑上 F12 也能看）
    if (level === "info") console.info("[mydiary]", msg);
    else if (level === "warn") console.warn("[mydiary]", msg);
    else console.error("[mydiary]", msg);
  };

  const [capsuleDays, setCapsuleDays] = useState<number | null>(null);
  const [showCapsuleMenu, setShowCapsuleMenu] = useState(false);
  const [wallpaper, setWallpaper] = useState<string | undefined>(initialDiary?.wallpaper);
  const [showLines, setShowLines] = useState<boolean>(initialDiary?.showLines ?? true);
  const [showWallpaperMenu, setShowWallpaperMenu] = useState(false);
  const [templateId, setTemplateId] = useState<string | undefined>(initialDiary?.templateId ?? initialTemplateId);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [pendingRec, setPendingRec] = useState<PendingRecording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [tags, setTags] = useState<string[]>(initialPolished?.tags ?? initialDiary?.tags ?? []);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // iOS Safari 键盘弹起时用 visualViewport 检测高度变化
  useEffect(() => {
    const vv = (window as unknown as { visualViewport?: VisualViewport }).visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(kb);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // 自定义确认弹窗状态
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSwitchTpl, setConfirmSwitchTpl] = useState(false);
  // 暂存切换模板时选中的目标模板
  const pendingTplRef = useRef<string | undefined>(undefined);

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

  // 新建日记时：如果给了 initialTemplateId → 从模板读初始值
  // 🔑 initialPolished（AI 快记注入）只跳过 blocks/title/mood/tags，但模板的视觉属性（showLines/wallpaper）仍然要应用
  useEffect(() => {
    if (initialDiary) return; // 编辑模式不走这里
    const tpl = templateById(initialTemplateId);
    if (!tpl) return;
    setTemplateId(tpl.id);
    // 视觉属性：不管有没有 polished 都应用
    if (tpl.showLines !== undefined) setShowLines(tpl.showLines);
    if (tpl.wallpaper) setWallpaper(tpl.wallpaper);
    // 内容属性：有 polished 就跳过模板默认值
    if (initialPolished) return;
    setBlocks(tpl.defaultBlocks.map((b) => ({ ...b })));
    if (tpl.defaultTitle) setTitle(tpl.defaultTitle);
    if (tpl.defaultMoodId) setMoodId(tpl.defaultMoodId);
    if (tpl.defaultTags?.length) setTags([...tpl.defaultTags]);
  }, [initialDiary, initialTemplateId, initialPolished]);

  // 新建日记时自动加载顶部栏的 定位 + 天气（不用用户点按钮）
  // 注意：自动模式只走 IP 定位，不碰 GPS（iOS Safari 要求 GPS 必须用户手势触发）
  // 用户点「📍 点我定位」按钮则会调 fetchLocation() 拿真实 GPS
  useEffect(() => {
    if (initialDiary) return; // 编辑模式已有数据，不自动拉
    let cancelled = false;

    async function autoLoad() {
      setWeatherLoading(true);
      setLocationLoading(true);
      pushLog(`🚀 自动加载顶部栏 (IP定位+天气), template=${templateId}`);

      // 1) IP 定位（不走 GPS，避免 iOS 静默拦截）
      const loc = await fetchLocationAuto();
      if (cancelled) return;
      pushLog(`📍 自动定位: ${loc.name} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}) 来源=${loc.source}`);
      setLocation({ name: loc.name, lat: loc.lat, lon: loc.lon });
      setLocationSource(loc.source);

      // 2) 天气
      try {
        const w = await fetchWeather(loc.lat, loc.lon);
        if (!cancelled && w) {
          pushLog(`☀️ 自动天气: ${w.temp}° ${w.description}`);
          setWeather(w);
        }
      } catch (e) {
        pushLog(`⚠️ 天气失败: ${(e as any)?.message ?? e}`, "warn");
      }

      // 3) POI（旅行模板自动拉）
      if (templateId === "travel") {
        pushLog(`🗺️ 自动拉 POI...`);
        await loadNearbyPois(loc.lat, loc.lon);
      }

      setWeatherLoading(false);
      setLocationLoading(false);
    }

    void autoLoad();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 手动重新获取 GPS + 天气 + POI */
  async function refetchAll() {
    let cancelled = false;
    setWeatherLoading(true);
    setLocationLoading(true);
    pushLog(`🚀 开始定位, template=${templateId}, 编辑=${!!initialDiary}`);

    // 1) 定位（最关键，必须成功）
    const loc = await fetchLocation();
    if (cancelled) return;
    pushLog(`📍 定位: ${loc.name} (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}) 来源=${loc.source}${loc.gpsError ? ` GPS错=${loc.gpsError}` : ""}`);
    setLocation({ name: loc.name, lat: loc.lat, lon: loc.lon });
    setLocationSource(loc.source);
    setLocationError(loc.gpsError);

    // 2) 天气（单独 try/catch，别让天气挂了影响 POI）
    try {
      const w = await fetchWeather(loc.lat, loc.lon);
      if (!cancelled && w) {
        pushLog(`☀️ 天气: ${w.temp}° ${w.description}`);
        setWeather(w);
      }
    } catch (e) {
      pushLog(`⚠️ 天气失败（不影响POI）: ${(e as any)?.message ?? e}`, "warn");
    }

    // 3) POI（旅行模板才拉）
    if (!initialDiary && templateId === "travel") {
      pushLog(`🗺️ 开始拉 POI...`);
      await loadNearbyPois(loc.lat, loc.lon);
    } else {
      pushLog(`⏭️ 跳过 POI（不是旅行模板 或 编辑模式）`);
    }

    setWeatherLoading(false);
    setLocationLoading(false);
  }

  /** 拉附近 POI（旅行模板专用） */
  async function loadNearbyPois(lat: number, lon: number) {
    pushLog(`🔍 Overpass 查询中... (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
    setNearbyLoading(true);
    setNearbyError(null);
    nearbyAbortRef?.abort();
    const ctrl = new AbortController();
    setNearbyAbortRef(ctrl);
    try {
      const pois = await fetchNearbyPois(lat, lon, ["attraction", "food", "cafe", "hotel"], ctrl.signal);
      pushLog(`✅ POI 返回 ${pois.length} 个: ${pois.map(p => p.name).slice(0,5).join(", ")}`);
      setNearbyPois(pois);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      pushLog(`❌ POI 失败: ${e?.message ?? e}`, "error");
      setNearbyError(e?.message ?? "附近 POI 获取失败");
      setNearbyPois([]);
    }
    setNearbyLoading(false);
  }

  /** 模板从非 travel 切到 travel 时，自动拉 POI（如果已有坐标） */
  useEffect(() => {
    if (templateId === "travel" && !initialDiary && location?.lat && location?.lon) {
      void loadNearbyPois(location.lat, location.lon);
    }
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setWallpaper(initialDiary.wallpaper);
    setShowLines(initialDiary.showLines ?? true);
    setTemplateId(initialDiary.templateId);
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

  // === 记账自动计算 ===
  const financeSummary = useMemo(() => {
    const items = blocks.filter((b) => b.kind === "finance_item" && b.value);
    let expense = 0;
    let income = 0;
    for (const it of items) {
      if (it.direction === "income") income += it.value!;
      else expense += it.value!;
    }
    return { expense, income, balance: income - expense, count: items.length };
  }, [blocks]);

  // 本月汇总（所有已保存的 finance 模板日记）
  const monthSummary = useMemo(() => {
    if (!allDiaries) return null;
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    let expense = 0;
    let income = 0;
    let diaryCount = 0;
    for (const d of allDiaries) {
      if (d.templateId !== "finance") continue;
      const y = Number(d.date.slice(0, 4));
      const m = Number(d.date.slice(5, 7)) - 1;
      if (y !== thisYear || m !== thisMonth) continue;
      diaryCount++;
      for (const b of d.blocks) {
        if (b.kind === "finance_item" && b.value) {
          if (b.direction === "income") income += b.value;
          else expense += b.value;
        }
      }
    }
    return { expense, income, balance: income - expense, diaryCount };
  }, [allDiaries, templateId]);

  const isFinanceTemplate = templateId === "finance";

  const addFinanceItem = (direction: "expense" | "income" = "expense") => {
    const defaultCat = direction === "income" ? "salary" : "food";
    const newBlock: DiaryBlock = {
      id: uid("f"),
      kind: "finance_item",
      content: "",       // 备注
      value: 0,
      direction,
      category: defaultCat,
    };
    setBlocks((prev) => {
      // 找到最后一个 finance_item，在它后面插入新的
      const lastFinanceIdx = [...prev].reverse().findIndex((b) => b.kind === "finance_item");
      if (lastFinanceIdx === -1) return [...prev, newBlock];
      const insertAt = prev.length - 1 - lastFinanceIdx + 1;
      return [...prev.slice(0, insertAt), newBlock, ...prev.slice(insertAt)];
    });
  };
  const addBlock = (kind: DiaryBlock["kind"], content = "", durationMs?: number, autoText = true) => {
    const block: DiaryBlock = { id: uid(kind[0]), kind, content, durationMs };
    setBlocks((prev) => {
      // 非 text 块 + autoText=true → 自动在后面补一个空 text block
      // 确保用户永远有地方点（模仿 Notion/Word）
      if (kind !== "text" && autoText) {
        const emptyText: DiaryBlock = { id: uid("t"), kind: "text", content: "" };
        return [...prev, block, emptyText];
      }
      return [...prev, block];
    });
  };

  /** 一键把附近 POI 加入日记（在末尾插入 heading + text block） */
  const insertPoiBlock = (poi: Poi) => {
    const header: DiaryBlock = {
      id: uid("b"),
      kind: "heading",
      content: `${poi.categoryLabel} · ${poi.name}`,
      level: 3,
    };
    const text: DiaryBlock = {
      id: uid("b"),
      kind: "text",
      content: [
        poi.address ? `📍 ${poi.address}` : null,
        `🗺️ ${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`,
        poi.website ? `🔗 ${poi.website}` : null,
        poi.phone ? `📞 ${poi.phone}` : null,
        ...(poi.tags?.length ? [`🏷️ ${poi.tags.join(" · ")}`] : []),
        "",
        "我的感受：",
      ].filter(Boolean).join("\n"),
    };
    setBlocks((prev) => [...prev, header, text]);
    // 加标签
    setTags((prev) => {
      const set = new Set(prev);
      set.add("旅行");
      set.add(poi.categoryLabel);
      return Array.from(set);
    });
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

  // 壁纸图片压缩 — 长边≤1920px（壁纸需要覆盖全屏，比日记图片大一点）
  const handleWallpaperPick = async (file: File) => {
    try {
      const compressed = await compressImage(file, 1920, 0.8);
      setWallpaper(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setWallpaper(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

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

  // 把文字 append 到最后一个 text block（空的就填充，有内容就加换行追加）
  // 如果最后没有 text block（不太可能，因为 addBlock 会自动补），就新建一个
  const appendToLastText = (text: string) => {
    if (!text) return;
    setBlocks((prev) => {
      // 找最后一个 text block
      const lastTextIdx = [...prev].reverse().findIndex((b) => b.kind === "text");
      if (lastTextIdx === -1) {
        return [...prev, { id: uid("t"), kind: "text" as const, content: text }];
      }
      const realIdx = prev.length - 1 - lastTextIdx;
      const target = prev[realIdx];
      const sep = target.content.trim() ? "\n" : "";
      const updated = [...prev];
      updated[realIdx] = { ...target, content: target.content + sep + text };
      return updated;
    });
  };

  // 弹窗里的按钮动作
  const confirmSaveAudioAndText = () => {
    if (!pendingRec) return;
    const text = editableTranscript.trim();
    // 先加音频块（带自动补空 text），然后 append 转写文字到最后一个 text block
    addBlock("audio", pendingRec.dataUrl, pendingRec.durationMs);
    if (text) appendToLastText(text);
    cancelPending();
  };
  const confirmSaveTextOnly = () => {
    if (!pendingRec) return;
    appendToLastText(editableTranscript.trim());
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

  // 🆕 AI 美化：把转写文字丢给 polishTranscript，结果替换 blocks/title/mood/tags
  const [aiPolishing, setAiPolishing] = useState(false);
  const confirmAIPolish = async () => {
    if (!pendingRec) return;
    const text = editableTranscript.trim();
    if (!text) { alert("先录点东西呀～"); return; }
    setAiPolishing(true);
    try {
      const polished = await polishTranscript(text, { templateId: templateId ?? "diary" });
      if (polished.title) setTitle(polished.title);
      if (polished.blocks?.length) {
        const newBlocks: DiaryBlock[] = polished.blocks.map((b) => {
          const base = { id: uid("b"), kind: b.kind, content: b.content ?? "" };
          if (b.kind === "heading") return { ...base, level: b.level ?? 2 };
          if (b.kind === "checkbox") return { ...base, checked: !!b.checked };
          if (b.kind === "number") return { ...base, label: b.label, unit: b.unit, value: b.value };
          if (b.kind === "finance_item") return { ...base, label: b.label, direction: b.direction ?? "expense", category: b.category, value: b.value };
          return base;
        });
        setBlocks(newBlocks);
      }
      if (polished.mood) setMoodId(polished.mood as MoodId);
      if (polished.tags?.length) setTags(polished.tags);
      cancelPending();
    } catch (err) {
      console.warn("AI 美化失败:", err);
      alert("AI 美化失败，试试别的操作吧");
    } finally {
      setAiPolishing(false);
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
      if (b.kind === "divider" || b.kind === "heading" || b.kind === "number" || b.kind === "checkbox" || b.kind === "finance_item") return true;
      return !!b.content; // image/audio 需要有 dataURL
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
      templateId,
      promptId: capsuleDays ? `capsule-${capsuleDays}d` : undefined,
      capsuleUnlockAt,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      wallpaper,
      showLines,
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
    setConfirmDelete(true);
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
              // 新建 + 有内容 + 从没保存过 → 提示放弃；其他情况直接放行
              if (!initialDiary && hasContent && !savedIdRef.current) {
                setConfirmLeave(true);
                return;
              }
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
          {weatherLoading || locationLoading ? (
            <span className="inline-flex items-center gap-1 text-xs text-paper-ink2 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              定位中...
            </span>
          ) : (
            <div className="inline-flex items-center gap-1">
              {weather && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-paper-surface border border-paper-line">
                  <span>{weather.icon}</span>
                  <span className="text-paper-ink">{weather.temp}°</span>
                </span>
              )}
              {location?.name && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                    locationSource === "gps"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : locationSource === "ip"
                      ? "bg-sky-50 border-sky-200 text-sky-700"
                      : locationSource === "default"
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-paper-surface border-paper-line text-paper-ink"
                  }`}
                  title={
                    locationSource === "gps"
                      ? "GPS 精确定位"
                      : locationSource === "ip"
                      ? "IP 定位（粗略）"
                      : locationSource === "default"
                      ? gpsFailedMessage(locationError)
                      : ""
                  }
                >
                  <MapPin size={11} className="shrink-0" />
                  <span>{location.name}</span>
                  {locationSource === "ip" && <span className="opacity-60 text-[10px]">IP</span>}
                  {locationSource === "default" && <span className="opacity-60 text-[10px]">(?)</span>}
                </span>
              )}
              {/* 手动重新定位按钮（仅新建日记且编辑/创建模式） */}
              {!initialDiary && (
                <button
                  onClick={() => refetchAll()}
                  disabled={locationLoading || weatherLoading}
                  title="重新定位"
                  className="p-1 rounded-full hover:bg-paper-surface active:scale-90 text-paper-ink2 disabled:opacity-40"
                >
                  <MapPin size={14} />
                </button>
              )}
            </div>
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

      {/* 附近 POI（仅旅行模板 + 新建日记） */}
      {templateId === "travel" && !initialDiary && (
        <div className="max-w-2xl w-full mx-auto px-4 mb-3">
          {!location?.lat ? (
            // === 还没定位 → 显示大按钮 ===
            <button
              onClick={() => refetchAll()}
              disabled={locationLoading || weatherLoading}
              className="w-full rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-left hover:shadow-md active:scale-[0.99] transition disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">
                  📍
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-amber-900">点我定位，看看附近有什么</div>
                  <div className="text-[11px] text-amber-700/70 mt-0.5">
                    获取 GPS 精确位置 + 天气 + 周边景点美食推荐
                  </div>
                </div>
                {(locationLoading || weatherLoading) && (
                  <Loader2 size={16} className="animate-spin text-amber-600" />
                )}
              </div>
            </button>
          ) : (
            // === 已定位 → 显示 POI 区域 ===
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🗺️</span>
                  <span className="text-xs font-medium text-amber-800">附近有什么</span>
                  <span className="text-[11px] text-amber-600 opacity-70">· {location.name}</span>
                  {locationSource === "ip" && <span className="text-[10px] text-amber-500/80">IP 粗略</span>}
                </div>
                <button
                  onClick={() => location?.lat && location?.lon && loadNearbyPois(location.lat, location.lon)}
                  disabled={nearbyLoading}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-amber-700 hover:bg-amber-100 disabled:opacity-40 active:scale-95"
                >
                  <RefreshCw size={11} className={nearbyLoading ? "animate-spin" : ""} />
                  刷新
                </button>
              </div>

              {nearbyLoading && (
                <div className="text-xs text-amber-700/70 flex items-center gap-1.5 py-2">
                  <Loader2 size={12} className="animate-spin" />
                  搜索附近景点、美食、咖啡、酒店...
                </div>
              )}

              {!nearbyLoading && nearbyError && (
                <div className="text-xs text-red-600 py-2">📍 {nearbyError}</div>
              )}

              {!nearbyLoading && !nearbyError && nearbyPois.length === 0 && (
                <div className="text-xs text-amber-700/60 py-2">附近没搜到 POI，换个位置试试？</div>
              )}

              {!nearbyLoading && nearbyPois.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
                  {nearbyPois.map((poi) => (
                    <NearbyPoiCard
                      key={poi.id}
                      poi={poi}
                      onAdd={() => insertPoiBlock(poi)}
                    />
                  ))}
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-amber-200/50 text-[11px] text-amber-600/70 text-center">
                数据来源 OpenStreetMap · 全球免费 · 精度取决于城市数据
              </div>
            </div>
          )}
        </div>
      )}

      {/* 块列表 — 信纸区域 */}
      <div className="max-w-2xl w-full mx-auto px-4 pb-24" style={{ paddingBottom: 96 + keyboardOffset }}>
        <div
          className={`paper-editor rounded-card shadow-card min-h-[200px] ${wallpaper ? "has-wallpaper" : ""} ${!showLines ? "no-lines" : ""}`}
          style={wallpaper ? { backgroundImage: `url(${wallpaper})` } : undefined}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b, idx) => (
          <SortableBlock id={b.id} key={b.id}>
          <div className="px-4 md:px-6">
            {b.kind === "text" && (
              <TextBlock block={b} onChange={(c) => updateBlock(b.id, { content: c })} onRemove={() => removeBlock(b.id)} />
            )}
            {b.kind === "image" && (
              <GridSnap minRows={2}><ImageBlock block={b} onRemove={() => removeBlock(b.id)} /></GridSnap>
            )}
            {b.kind === "audio" && (
              <GridSnap minRows={3}><AudioBlock block={b} onRemove={() => removeBlock(b.id)} /></GridSnap>
            )}

            {/* heading — 小标题，加粗 */}
            {b.kind === "heading" && (
              <div className="py-1.5 group flex items-center gap-2">
                <input
                  type="text"
                  value={b.content}
                  onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                  placeholder="标题..."
                  className={`flex-1 bg-transparent outline-none font-bold placeholder:text-paper-ink3 ${
                    (b.level ?? 2) === 1 ? "text-2xl" : (b.level ?? 2) === 3 ? "text-base" : "text-lg"
                  } text-paper-ink`}
                />
                <button
                  onClick={() => removeBlock(b.id)}
                  className="opacity-0 group-hover:opacity-100 text-paper-ink3 hover:text-red-500 text-sm transition"
                  title="删除"
                >×</button>
              </div>
            )}

            {/* number — 数字输入（记账用） */}
            {b.kind === "number" && (
              <div className="py-1 group flex items-center gap-3">
                <span className="text-sm text-paper-ink2 w-16 shrink-0">{b.label ?? "金额"}</span>
                {b.unit && <span className="text-lg text-paper-ink font-semibold">{b.unit}</span>}
                <input
                  type="number"
                  inputMode="decimal"
                  value={b.value ?? ""}
                  onChange={(e) => updateBlock(b.id, { value: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="0"
                  className="flex-1 bg-transparent outline-none text-lg text-paper-ink font-semibold min-w-0"
                />
                <button
                  onClick={() => removeBlock(b.id)}
                  className="opacity-0 group-hover:opacity-100 text-paper-ink3 hover:text-red-500 text-sm transition"
                  title="删除"
                >×</button>
              </div>
            )}

            {/* divider — 虚线分隔 */}
            {b.kind === "divider" && (
              <div className="py-2 flex items-center gap-3 group">
                <div className="flex-1 h-px border-t border-dashed border-paper-line" />
                <button
                  onClick={() => removeBlock(b.id)}
                  className="opacity-0 group-hover:opacity-100 text-paper-ink3 hover:text-red-500 text-sm transition"
                  title="删除"
                >×</button>
                <div className="flex-1 h-px border-t border-dashed border-paper-line" />
              </div>
            )}

            {/* checkbox — 可勾选的待办 */}
            {b.kind === "checkbox" && (
              <div className="py-1 group flex items-center gap-2">
                <button
                  onClick={() => updateBlock(b.id, { checked: !b.checked })}
                  className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition ${
                    b.checked
                      ? "bg-paper-accent border-paper-accent text-white"
                      : "border-paper-line hover:border-paper-accent"
                  }`}
                  title={b.checked ? "取消勾选" : "勾选"}
                >
                  {b.checked && <span className="text-xs leading-none">✓</span>}
                </button>
                <input
                  type="text"
                  value={b.content}
                  onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                  placeholder="待办事项..."
                  className={`flex-1 bg-transparent outline-none text-sm placeholder:text-paper-ink3 min-w-0 ${
                    b.checked ? "text-paper-ink3 line-through" : "text-paper-ink"
                  }`}
                />
                <button
                  onClick={() => removeBlock(b.id)}
                  className="opacity-0 group-hover:opacity-100 text-paper-ink3 hover:text-red-500 text-sm transition"
                  title="删除"
                >×</button>
              </div>
            )}

            {/* finance_item — 记账流水 */}
            {b.kind === "finance_item" && (
              <FinanceItemRow
                block={b}
                onChange={(patch) => updateBlock(b.id, patch)}
                onRemove={() => removeBlock(b.id)}
              />
            )}

            {idx === blocks.length - 1 && <div className="h-6" />}
          </div>
          </SortableBlock>
          ))}
          </SortableContext>
          </DndContext>

          {/* === 记账专属：汇总卡片 + 添加按钮（只在记账模板时显示） === */}
          {isFinanceTemplate && financeSummary.count > 0 && (
            <div className="px-4 md:px-6 mt-2 mb-1">
              <div className="rounded-xl border border-paper-line bg-paper-surface/50 p-3">
                <div className="text-xs text-paper-ink2 mb-2 font-medium">今日汇总</div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-paper-ink2">支出</span>
                  <span className="font-semibold text-red-600">¥{financeSummary.expense.toFixed(2)}</span>
                  <span className="text-paper-ink2">收入</span>
                  <span className="font-semibold text-emerald-600">¥{financeSummary.income.toFixed(2)}</span>
                  <div className="flex-1" />
                  <span className={`font-bold ${financeSummary.balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {financeSummary.balance >= 0 ? "+" : "−"}¥{Math.abs(financeSummary.balance).toFixed(2)}
                  </span>
                </div>
              </div>
             </div>
           )}
          {/* 本月汇总（如果有历史数据） */}
          {isFinanceTemplate && monthSummary && monthSummary.diaryCount > 0 && (
            <div className="px-4 md:px-6 mt-1 mb-1">
              <div className="rounded-xl border border-paper-line bg-paper-surface/30 p-3">
                <div className="text-xs text-paper-ink2 mb-1.5 font-medium flex items-center gap-1.5">
                  📅 本月合计 · {monthSummary.diaryCount} 天
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-paper-ink2">支出</span>
                  <span className="font-semibold text-red-600">¥{monthSummary.expense.toFixed(2)}</span>
                  <span className="text-paper-ink2">收入</span>
                  <span className="font-semibold text-emerald-600">¥{monthSummary.income.toFixed(2)}</span>
                  <div className="flex-1" />
                  <span className={`font-bold text-base ${monthSummary.balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {monthSummary.balance >= 0 ? "+" : "−"}¥{Math.abs(monthSummary.balance).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
          {isFinanceTemplate && (
            <div className="px-4 md:px-6 pb-2 flex gap-2">
              <button
                onClick={() => addFinanceItem("expense")}
                className="flex-1 py-2 rounded-xl border border-dashed border-paper-line hover:border-red-300 hover:bg-red-50 text-sm text-paper-ink2 hover:text-red-600 transition active:scale-[0.98]"
              >
                + 添加支出
              </button>
              <button
                onClick={() => addFinanceItem("income")}
                className="flex-1 py-2 rounded-xl border border-dashed border-paper-line hover:border-emerald-300 hover:bg-emerald-50 text-sm text-paper-ink2 hover:text-emerald-600 transition active:scale-[0.98]"
              >
                + 添加收入
              </button>
            </div>
          )}

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
                   onClick={confirmAIPolish}
                   disabled={aiPolishing}
                   className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink text-sm font-medium hover:bg-paper-line/50 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                   {aiPolishing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
                   {aiPolishing ? "AI 美化中..." : "AI 美化"}
                 </button>
               )}
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
      <footer className="fixed bottom-0 left-0 right-0 bg-[#faf6ef]/95 backdrop-blur border-t border-paper-line z-20" style={{ bottom: keyboardOffset }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImagePick(e.target.files[0])} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAudioPick(e.target.files[0])} />
          <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWallpaperPick(f); e.target.value = ""; }} />

          <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line text-sm text-paper-ink hover:bg-paper-line/50 active:scale-95">
             <ImagePlus size={16} /> 图片
           </button>

           {/* 录音按钮：点一下切换录音状态，长按也支持 */}
            <RecordingButton
              recording={recording}
              disabled={transcribing || !!pendingRec}
              onToggle={() => recording ? stopRecording() : startRecording()}
            />

            {/* 信纸/壁纸按钮 */}
            <button
              onClick={() => setShowWallpaperMenu(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line text-sm text-paper-ink hover:bg-paper-line/50 transition active:scale-95"
              title="信纸 / 壁纸"
            >
              <Palette size={16} />
              {(wallpaper || !showLines) && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>

            {/* 模板按钮 */}
            <button
              onClick={() => setShowTemplateMenu(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-surface border border-paper-line text-sm text-paper-ink hover:bg-paper-line/50 transition active:scale-95"
              title="选择模板"
            >
              <LayoutTemplate size={16} />
              {templateId && templateId !== "diary" && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          </div>
        </footer>

        {/* 信纸选择 Drawer — 半屏底部弹出 */}
        {showWallpaperMenu && (
          <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowWallpaperMenu(false)}>
            {/* 遮罩 */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-[fade-in_0.2s]" />

            {/* 面板主体 */}
            <div
              className="relative w-full max-h-[75vh] bg-paper-card rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-[drawer-up_0.28s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 拖拽把手 */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-paper-line" />
              </div>

              {/* 标题 */}
              <div className="flex items-center justify-between px-5 py-2 border-b border-paper-line">
                <h3 className="font-semibold text-paper-ink">选择信纸</h3>
                <button
                  onClick={() => setShowWallpaperMenu(false)}
                  className="w-8 h-8 rounded-full hover:bg-paper-surface flex items-center justify-center text-paper-ink2"
                  aria-label="关闭"
                >✕</button>
              </div>

              {/* 内容区 — 可滚动 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* 预设信纸网格 */}
                <div>
                  <div className="text-xs text-paper-ink2 mb-3">预设信纸</div>
                  <div className="grid grid-cols-4 gap-3">
                    {PRESET_PAPERS.map((p) => {
                      const current = matchPreset(wallpaper);
                      const selected = current?.id === p.id || (!wallpaper && p.id === "default");
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            // default 预设 → 清空 wallpaper 让 CSS 接管
                            setWallpaper(p.id === "default" ? undefined : p.full);
                            // 纯纹理/方格纸 → 关掉横线更干净
                            if (p.isPattern) setShowLines(false);
                          }}
                          className={`group relative aspect-[3/4] rounded-lg border-2 overflow-hidden transition ${
                            selected ? "border-sky-400 ring-2 ring-sky-200" : "border-paper-line hover:border-paper-ink2"
                          }`}
                          title={p.name}
                        >
                          <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                          {selected && (
                            <div className="absolute inset-0 flex items-start justify-end p-1 pointer-events-none">
                              <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center shadow">✓</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 自定义图片 */}
                <div>
                  <div className="text-xs text-paper-ink2 mb-3">自定义</div>
                  <button
                    onClick={() => wallpaperInputRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-paper-line hover:border-paper-ink2 hover:bg-paper-surface transition text-paper-ink"
                  >
                    <div className="w-10 h-10 rounded-lg bg-paper-surface border border-paper-line flex items-center justify-center text-lg">📷</div>
                    <div className="text-left">
                      <div className="text-sm font-medium">从相册选一张图片</div>
                      <div className="text-xs text-paper-ink2">选上面留白的图，方便写字</div>
                    </div>
                  </button>
                  {wallpaper && matchPreset(wallpaper) === null && (
                    <button
                      onClick={() => setWallpaper(undefined)}
                      className="mt-2 w-full text-center text-xs text-paper-ink3 hover:text-red-500 py-1"
                    >🗑 移除自定义壁纸，恢复默认</button>
                  )}
                </div>

                {/* 横线开关 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-paper-surface border border-paper-line">
                  <div>
                    <div className="text-sm text-paper-ink font-medium">显示横线</div>
                    <div className="text-xs text-paper-ink2">横线独立于信纸，可单独关闭</div>
                  </div>
                  <button
                    onClick={() => setShowLines((v) => !v)}
                    className={`relative inline-block w-10 h-5 rounded-full transition-colors ${showLines ? "bg-amber-400" : "bg-gray-300"}`}
                    aria-label="切换横线"
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-[left] duration-200 ${showLines ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 模板选择 Drawer */}
        {showTemplateMenu && (
          <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowTemplateMenu(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-[fade-in_0.2s]" />
            <div
              className="relative w-full max-h-[75vh] bg-paper-card rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-[drawer-up_0.28s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-paper-line" />
              </div>
              <div className="flex items-center justify-between px-5 py-2 border-b border-paper-line">
                <h3 className="font-semibold text-paper-ink">选择模板</h3>
                <button
                  onClick={() => setShowTemplateMenu(false)}
                  className="w-8 h-8 rounded-full hover:bg-paper-surface flex items-center justify-center text-paper-ink2"
                  aria-label="关闭"
                >✕</button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  {TEMPLATES.map((tpl) => {
                    const selected = templateId === tpl.id || (!templateId && tpl.id === "diary");
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          const hasContent = blocks.some(
                            (b) => b.kind === "text" ? b.content.trim().length > 0 : !!b.content
                          );
                          if (hasContent) {
                            pendingTplRef.current = tpl.id;
                            setConfirmSwitchTpl(true);
                            return;
                          }
                          setTemplateId(tpl.id);
                           setBlocks(tpl.defaultBlocks.map((b) => ({ ...b })));
                           if (tpl.defaultTitle) setTitle(tpl.defaultTitle);
                           if (tpl.defaultMoodId) setMoodId(tpl.defaultMoodId);
                           if (tpl.wallpaper) setWallpaper(tpl.wallpaper);
                           else if (tpl.id === "diary") setWallpaper(undefined);
                           if (tpl.showLines !== undefined) setShowLines(tpl.showLines);
                           if (tpl.defaultTags?.length) setTags([...tpl.defaultTags]);
                          setShowTemplateMenu(false);
                        }}
                        className={`p-3 rounded-xl border-2 text-left transition ${
                          selected
                            ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/50"
                            : "border-paper-line hover:border-paper-ink2 hover:bg-paper-surface"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{tpl.icon}</span>
                          <span className={`font-medium text-sm ${selected ? "text-violet-900" : "text-paper-ink"}`}>
                            {tpl.name}
                          </span>
                          {selected && <span className="ml-auto w-5 h-5 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center">✓</span>}
                        </div>
                        <div className="text-[11px] text-paper-ink2 leading-tight">{tpl.description}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 px-1 text-[11px] text-paper-ink3 italic">
                  模板 = 初始文案 + 专属信纸 + 默认标签，换模板会替换当前内容
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 自定义确认弹窗：放弃未保存内容 */}
        <ConfirmDialog
          open={confirmLeave}
          title="放弃编辑？"
          message="内容还没保存，确定放弃吗？"
          confirmText="放弃并返回"
          cancelText="留下来写"
          confirmTone="danger"
          onConfirm={() => { setConfirmLeave(false); onCancel(); }}
          onCancel={() => setConfirmLeave(false)}
        />

        {/* 自定义确认弹窗：删除日记 */}
        <ConfirmDialog
          open={confirmDelete}
          title="删除日记？"
          message="删除后会进入回收站，30 天内可恢复。"
          confirmText="删除"
          cancelText="取消"
          confirmTone="danger"
          onConfirm={() => { setConfirmDelete(false); if (initialDiary) onSoftDelete(initialDiary); }}
          onCancel={() => setConfirmDelete(false)}
        />

        {/* 自定义确认弹窗：切换模板 */}
        <ConfirmDialog
          open={confirmSwitchTpl}
          title="切换模板？"
          message="切换模板会替换当前内容，确定继续吗？"
          confirmText="切换"
          cancelText="取消"
          onConfirm={() => {
            setConfirmSwitchTpl(false);
            const tplId = pendingTplRef.current;
            if (!tplId) return;
            const tpl = templateById(tplId);
            if (!tpl) return;
            setTemplateId(tpl.id);
            setBlocks(tpl.defaultBlocks.map((b) => ({ ...b })));
            if (tpl.defaultTitle) setTitle(tpl.defaultTitle);
            if (tpl.defaultMoodId) setMoodId(tpl.defaultMoodId);
            if (tpl.wallpaper) setWallpaper(tpl.wallpaper);
            else if (tpl.id === "diary") setWallpaper(undefined);
            if (tpl.showLines !== undefined) setShowLines(tpl.showLines);
            if (tpl.defaultTags) setTags(tpl.defaultTags);
          }}
          onCancel={() => setConfirmSwitchTpl(false)}
        />

        
      </div>
    );
  }

// 记账流水条目组件 — 支持切换方向 / 选分类 / 填金额 / 写备注
function FinanceItemRow({
  block,
  onChange,
  onRemove,
}: {
  block: DiaryBlock;
  onChange: (patch: Partial<DiaryBlock>) => void;
  onRemove: () => void;
}) {
  const dir = block.direction ?? "expense";
  const catList = categoriesByDir(dir);

  const dirText = dir === "income" ? "收入" : "支出";
  const amountColor = dir === "income" ? "text-emerald-600" : "text-red-600";

  return (
    <div className={`group flex items-center gap-2 py-1.5 border-b border-paper-line/40 last:border-b-0 rounded-lg hover:bg-paper-surface/50 px-1 transition`}>
      {/* 方向切换（支出/收入） */}
      <button
        onClick={() => onChange({ direction: dir === "income" ? "expense" : "income" } as Partial<DiaryBlock>)}
        className={`shrink-0 w-12 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition ${
          dir === "income"
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-red-100 text-red-700 hover:bg-red-200"
        }`}
        title={`切换为${dir === "income" ? "支出" : "收入"}`}
      >
        {dirText}
      </button>

      {/* 分类下拉 */}
      <select
        value={block.category ?? ""}
        onChange={(e) => onChange({ category: e.target.value } as Partial<DiaryBlock>)}
        className="shrink-0 bg-paper-surface border border-paper-line rounded-lg px-2 py-1 text-sm outline-none focus:border-paper-accent cursor-pointer"
      >
        {catList.map((c) => (
          <option key={c.key} value={c.key}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      {/* 金额 */}
      <div className="flex items-center gap-1 shrink-0">
        <span className={`text-lg font-bold ${amountColor}`}>{dir === "income" ? "+" : "−"}</span>
        <span className={`text-sm font-medium ${amountColor}`}>¥</span>
        <input
          type="number"
          inputMode="decimal"
          value={block.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value ? Number(e.target.value) : 0 } as Partial<DiaryBlock>)}
          placeholder="0"
          className="w-16 bg-transparent outline-none text-lg font-bold text-paper-ink text-right min-w-0"
        />
      </div>

      {/* 备注（可选） */}
      <input
        type="text"
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="备注..."
        className="flex-1 bg-transparent outline-none text-xs text-paper-ink2 placeholder:text-paper-ink3 min-w-0"
      />

      {/* 删除按钮 */}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-paper-ink3 hover:text-red-500 text-sm transition shrink-0"
        title="删除"
      >×</button>
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



// === 附近 POI 卡片组件（EditorPage 专用） ===
const POI_ICON: Record<string, string> = {
  attraction: '🏯',
  food: '🍜',
  cafe: '☕',
  hotel: '🏨',
};

const POI_CATEGORY_COLOR: Record<string, string> = {
  attraction: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  food: 'bg-rose-100 text-rose-700 border-rose-200',
  cafe: 'bg-amber-100 text-amber-700 border-amber-200',
  hotel: 'bg-sky-100 text-sky-700 border-sky-200',
};

function NearbyPoiCard({ poi, onAdd }: { poi: Poi; onAdd: () => void }) {
  return (
    <div className="shrink-0 w-44 snap-start bg-white rounded-lg border border-amber-100 p-2.5 hover:shadow-md transition">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="text-base leading-none">{POI_ICON[poi.category] ?? '📍'}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${POI_CATEGORY_COLOR[poi.category] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
          {poi.categoryLabel}
        </span>
      </div>
      <div className="text-xs font-medium text-gray-800 truncate leading-tight">{poi.name}</div>
      {poi.address && (
        <div className="text-[10px] text-gray-500 truncate mt-0.5">{poi.address}</div>
      )}
      {poi.tags && poi.tags.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {poi.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[9px] px-1 bg-gray-100 text-gray-600 rounded">{t}</span>
          ))}
        </div>
      )}
      <button
        onClick={onAdd}
        className="mt-2 w-full inline-flex items-center justify-center gap-1 py-1 rounded-md text-[11px] bg-amber-100 text-amber-800 hover:bg-amber-200 active:scale-95 transition"
      >
        <Plus size={10} /> 加入日记
      </button>
    </div>
  );
}
