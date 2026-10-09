import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, BookOpen, Calendar } from "lucide-react";
import type { Diary, MoodId } from "../types";
import { BookBlockRenderer } from "./BookBlockRenderer";

interface Props {
  diaries: Diary[];
  bookTitle: string;
  bookIcon: string;
  bookTheme: BookTheme;
  onClose: () => void;
  onEdit?: (diaryId: string) => void;
}

export interface BookTheme {
  name: string;
  pageBg: string;
  pageShadow: string;
  accent: string;
  spine: string;
}

export const BOOK_THEMES: Record<string, BookTheme> = {
  diary: { name: "日记", pageBg: "#fdfaf3", pageShadow: "rgba(180, 160, 120, 0.2)", accent: "#f59e0b", spine: "#a89880" },
  finance: { name: "账本", pageBg: "#f0f5f0", pageShadow: "rgba(120, 160, 120, 0.2)", accent: "#10b981", spine: "#6b8e6b" },
  travel: { name: "旅行", pageBg: "#f0f4fa", pageShadow: "rgba(120, 140, 180, 0.2)", accent: "#6366f1", spine: "#5a6a8a" },
  plan: { name: "计划", pageBg: "#faf6f0", pageShadow: "rgba(170, 150, 110, 0.2)", accent: "#d97706", spine: "#8a7a5a" },
  milestone: { name: "里程碑", pageBg: "#f5f2fa", pageShadow: "rgba(140, 120, 170, 0.2)", accent: "#8b5cf6", spine: "#7a6a9a" },
  yuwen_yueduli: { name: "阅读理解", pageBg: "#faf8f2", pageShadow: "rgba(180, 165, 120, 0.2)", accent: "#57534e", spine: "#7a7060" },
  booknote: { name: "读书", pageBg: "#faf5f2", pageShadow: "rgba(180, 140, 120, 0.2)", accent: "#f97316", spine: "#8a6a5a" },
};

const MOOD_EMOJI: Record<MoodId, string> = {
  happy: "😊", calm: "😌", sad: "😢", angry: "😠", anxious: "😰",
};

function PaperTexture() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-30"
      style={{
        backgroundImage: `repeating-linear-gradient(
          transparent, transparent 28px,
          rgba(180, 160, 120, 0.10) 28px, rgba(180, 160, 120, 0.10) 29px
        )`,
      }}
    />
  );
}

/** 封面（首页）：主题色渐变 + 书名 + 日期范围 + 装饰 */
function CoverPage({ title, icon, theme, diaries }: {
  title: string; icon: string; theme: BookTheme; diaries: Diary[];
}) {
  const dates = diaries.map(d => d.date ? new Date(d.date).getTime() : null).filter(Boolean) as number[];
  const minDate = dates.length ? new Date(Math.min(...dates)) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
  const fmt = (d: Date) => `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,"0")}.${d.getDate().toString().padStart(2,"0")}`;
  const range = minDate && maxDate
    ? (minDate.getTime() === maxDate.getTime() ? fmt(minDate) : `${fmt(minDate)} — ${fmt(maxDate)}`)
    : "";

  return (
    <div
      className="h-full w-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${theme.accent}18 0%, ${theme.accent}08 50%, ${theme.accent}12 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(
            135deg,
            transparent, transparent 40px,
            ${theme.accent}15 40px, ${theme.accent}15 41px
          )`,
        }}
      />
      <div className="absolute inset-4 border-2 pointer-events-none" style={{ borderColor: `${theme.accent}35` }} />
      <div className="absolute inset-6 border pointer-events-none" style={{ borderColor: `${theme.accent}20` }} />

      <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
        <div className="text-5xl mb-2" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }}>{icon}</div>
        <h2 className="text-2xl font-bold tracking-wide book-heading" style={{ color: theme.accent }}>
          {title}
        </h2>
        {range && <div className="text-xs tracking-widest text-stone-400">{range}</div>}
        <div className="w-12 h-0.5 mt-2" style={{ background: `linear-gradient(to right, transparent, ${theme.accent}60, transparent)` }} />
        <div className="text-[10px] tracking-[0.3em] uppercase text-stone-400">My Diary</div>
      </div>
    </div>
  );
}

/** 封底（尾页） */
function BackCoverPage({ theme }: { theme: BookTheme }) {
  return (
    <div
      className="h-full w-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(-20deg, ${theme.accent}15 0%, ${theme.accent}05 60%, ${theme.accent}10 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `repeating-radial-gradient(
            circle at 50% 50%,
            ${theme.accent}10 0px,
            ${theme.accent}10 1px,
            transparent 1px,
            transparent 30px
          )`,
        }}
      />
      <div className="absolute inset-4 border pointer-events-none" style={{ borderColor: `${theme.accent}30` }} />

      <div className="relative z-10 flex flex-col items-center gap-5 text-center px-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}30, ${theme.accent}10)`,
            color: theme.accent,
            boxShadow: `0 2px 12px ${theme.accent}30, inset 0 0 12px ${theme.accent}15`,
          }}
        >完</div>
        <div className="text-sm tracking-[0.4em] uppercase text-stone-400">The End</div>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${theme.accent}60, transparent)` }} />
        <div className="text-[10px] tracking-widest text-stone-300 italic">— 日记到此结束 —</div>
      </div>
    </div>
  );
}

function PageContent({ diary, pageNumber, onEdit }: {
  diary: Diary;
  pageNumber: number;
  onEdit?: (id: string) => void;
}) {
  const dateObj = diary.date ? new Date(diary.date) : null;
  const dateStr = dateObj
    ? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 · ${["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()]}`
    : "";
  const moodEmoji = diary.moodId ? MOOD_EMOJI[diary.moodId] : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-stone-200/60 shrink-0">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Calendar className="w-4 h-4" />
          <span>{dateStr || "无日期"}</span>
          {moodEmoji && <span className="text-lg">{moodEmoji}</span>}
        </div>
        {diary.title && (
          <h3 className="mt-1 font-bold text-base book-heading">{diary.title}</h3>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 custom-scroll">
        {diary.blocks?.map((b, i) => (
          <BookBlockRenderer key={i} index={i} block={b} />
        ))}
        <div className="mt-6 flex justify-between items-center text-xs text-stone-400 border-t border-stone-200/50 pt-2">
          <span>No. {pageNumber.toString().padStart(2, "0")}</span>
          {onEdit && (
            <button onClick={() => onEdit(diary.id)} className="hover:text-stone-700 transition">
              编辑 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ⭐ 超时保护: transitionend 不一定会触发（tab 切换、reflow 等），
 *  用 timeout 兜底强制执行 cleanup callback，避免 animRef 永远 true 卡死
 *  ⚠️ 必须校验 e.target === el && e.propertyName === "transform"：
 *     transitionend 会冒泡，子元素 .book-fold-shadow 有 background transition，
 *     不校验的话它的 300ms transitionend 会劫持 520ms 的翻页动画收尾 */
function safeTransitionEnd(
  el: HTMLElement,
  timeoutMs: number,
  callback: (e?: TransitionEvent) => void
) {
  let done = false;
  const once = (e: TransitionEvent) => {
    // ⭐ 只处理 el 自身的 transform 过渡，忽略子元素冒泡
    if (e && (e.target !== el || e.propertyName !== "transform")) return;
    if (done) return;
    done = true;
    el.removeEventListener("transitionend", once as any);
    clearTimeout(timer);
    callback(e);
  };
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    el.removeEventListener("transitionend", once as any);
    callback();
  }, timeoutMs);
  el.addEventListener("transitionend", once as any);
}

/** 根据索引取日记：i<0 → 封面，i>=total → 封底，否则 diaries[i] */
function pageAt(diaries: Diary[], i: number): Diary | null {
  if (i < 0 || i >= diaries.length) return null;
  return diaries[i];
}

/** 返回 pageAt 的页码（1-based），用于 PageContent 的 No. 显示 */
function pageNumFor(total: number, i: number): number {
  if (i < 0) return 0;         // 封面
  if (i >= total) return total + 1; // 封底
  return i + 1;
}

export default function BookReader({
  diaries, bookTitle, bookIcon, bookTheme, onClose, onEdit,
}: Props) {
  const total = diaries.length;

  // === 新模型：spread = 右页索引（双页时偶数），step = 翻页步长 ===
  const [spread, setSpread] = useState(0);
  const [flipping, setFlipping] = useState<null | "next" | "prev">(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(false);

  const [isSinglePage, setIsSinglePage] = useState(() => {
    if (typeof window === "undefined") return false;
    const m = window.matchMedia("(max-width: 768px), (max-aspect-ratio: 1/1)");
    return m.matches;
  });
  useEffect(() => {
    const m = window.matchMedia("(max-width: 768px), (max-aspect-ratio: 1/1)");
    const handler = (e: MediaQueryListEvent) => setIsSinglePage(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  const step = isSinglePage ? 1 : 2;
  const canPrev = spread - step >= 0;
  const canNext = spread + step <= total;

  // === 稳定 ref（给一次性安装的事件监听器读最新 state） ===
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
  const totalRef = useRef(total);
  totalRef.current = total;
  const singleRef = useRef(isSinglePage);
  singleRef.current = isSinglePage;
  const canRef = useRef({ canNext, canPrev });
  canRef.current = { canNext, canPrev };

  // === 翻页方向（prev → sheet 左侧，next → sheet 右侧） ===
  // 翻完后 sheet 永远复位到右侧（只在翻页过程中临时移到左侧）
  const sheetSideRef = useRef<"left" | "right">("right");
  const sheetOriginRef = useRef("left center");

  // === 拖拽状态 ===
  const dragRef = useRef({
    active: false,
    dir: null as "next" | "prev" | null,
    startX: 0,
    startY: 0,
    lastDeltaX: 0,
    flipInitiated: false,
  });

  // === useLayoutEffect 复位（paint 前完成，避免中间帧闪烁） ===
  const [pendingReset, setPendingReset] = useState<null | { side: "left" | "right" }>(null);
  useLayoutEffect(() => {
    if (!pendingReset) return;
    const s = sheetRef.current;
    if (s) {
      s.style.transition = "none";
      s.style.transform = "rotateY(0deg)";
      s.classList.remove("book-sheet-left", "book-sheet-right");
      s.classList.add("book-sheet-right");
      s.style.transformOrigin = "left center";
    }
    sheetSideRef.current = "right";
    sheetOriginRef.current = "left center";
    setPendingReset(null);
  }, [pendingReset]);

  // === 推导：根据 spread / flipping / isSinglePage 算出所有页面内容 ===
  const flippingDir = flipping; // "next" | "prev" | null
  const onLeft = flippingDir === "prev";

  // 双页 next：spread=b → 左页 b-1，右页 b+2（翻完 spread=b+2）
  // 双页 prev：spread=b → 左页 b-3，右页 b（翻完 spread=b-2）
  // 单页 next：spread=b → 右页 b+1（翻完 spread=b+1）
  // 单页 prev：spread=b → 右页 b-1（翻完 spread=b-1）
  const bottomLeftIdx = isSinglePage ? -99 : (onLeft ? spread - 3 : spread - 1);
  const bottomRightIdx = isSinglePage
    ? (onLeft ? spread - 1 : spread + 1)
    : (onLeft ? spread : spread + 2);
  const sheetFrontIdx = isSinglePage ? spread : (onLeft ? spread - 1 : spread);
  const sheetBackIdx = isSinglePage
    ? (onLeft ? spread - 1 : spread + 1)
    : (onLeft ? spread - 2 : spread + 1);

  const bottomLeft = isSinglePage ? null : pageAt(diaries, bottomLeftIdx);
  const bottomRight = pageAt(diaries, bottomRightIdx);
  const sheetFront = pageAt(diaries, sheetFrontIdx);
  const sheetBack = pageAt(diaries, sheetBackIdx);

  const bottomLeftNum = pageNumFor(total, bottomLeftIdx);
  const bottomRightNum = pageNumFor(total, bottomRightIdx);
  const sheetFrontNum = pageNumFor(total, sheetFrontIdx);
  const sheetBackNum = pageNumFor(total, sheetBackIdx);

  // === snapFlip：单段动画 520ms，无 Phase 3 ===
  const snapFlip = useCallback((dir: "next" | "prev") => {
    const sheet = sheetRef.current;
    if (!sheet || animRef.current) return;
    const curSpread = spreadRef.current;
    const curStep = singleRef.current ? 1 : 2;
    if (dir === "next" && curSpread + curStep > totalRef.current) return;
    if (dir === "prev" && curSpread - curStep < 0) return;

    animRef.current = true;
    setFlipping(dir);

    const side: "left" | "right" = dir === "prev" ? "left" : "right";
    const origin = side === "right" ? "left center" : "right center";
    sheetSideRef.current = side;
    sheetOriginRef.current = origin;

    sheet.style.transition = "none";
    sheet.style.transform = "rotateY(0deg)";
    sheet.style.transformOrigin = origin;
    sheet.classList.remove("book-sheet-left", "book-sheet-right");
    sheet.classList.add(`book-sheet-${side}`);
    void sheet.offsetWidth;

    const sign = dir === "next" ? -1 : 1;
    sheet.style.transition = "transform 520ms cubic-bezier(0.33, 0.1, 0.33, 1)";
    sheet.style.transform = `rotateY(${sign * 180}deg)`;

    // 动画结束：useLayoutEffect 同步复位 + setSpread（同帧）
    safeTransitionEnd(sheet, 540, () => {
      const newSpread = dir === "next" ? curSpread + curStep : curSpread - curStep;
      flushSync(() => setSpread(newSpread));
      setFlipping(null);
      animRef.current = false;
      setPendingReset({ side });
    });
  }, []); // 空依赖：全部读 ref

  // === 拖拽事件监听器：一次性安装，空依赖 ===
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      const s = dragRef.current;
      const sheet = sheetRef.current;
      if (!s.active || !sheet) return;

      const deltaX = clientX - s.startX;
      const deltaY = clientY - s.startY;
      s.lastDeltaX = deltaX;
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) return;

      const single = singleRef.current;
      const can = canRef.current;

      if (single) {
        if (deltaX < -20 && s.dir !== "next" && can.canNext) {
          s.dir = "next";
        } else if (deltaX > 20 && s.dir !== "prev" && can.canPrev) {
          s.dir = "prev";
        }
      }

      if (!s.dir) return;

      // 首次检测到拖拽：设置翻页起始侧
      if (!s.flipInitiated && Math.abs(deltaX) > 5) {
        s.flipInitiated = true;
        setFlipping(s.dir);
        const side: "left" | "right" = s.dir === "prev" ? "left" : "right";
        const origin = side === "right" ? "left center" : "right center";
        sheetSideRef.current = side;
        sheetOriginRef.current = origin;
        sheet.style.transition = "none";
        sheet.style.transformOrigin = origin;
        sheet.classList.remove("book-sheet-left", "book-sheet-right");
        sheet.classList.add(`book-sheet-${side}`);
        void sheet.offsetWidth;
      }

      if (!s.flipInitiated) return;

      const c = containerRef.current!;
      const effective = s.dir === "next" ? -deltaX : deltaX;
      const ratio = Math.min(Math.abs(effective) / (c.clientWidth * 0.6), 1);
      const angle = ratio * 180;

      sheet.style.transition = "none";
      sheet.style.transform = `rotateY(${(s.dir === "next" ? -1 : 1) * angle}deg)`;
    };

    // 原生事件适配层（让定制签名匹配 EventListener）
    const onNativeMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onNativeTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };

    const handleUp = () => {
      const s = dragRef.current;
      const sheet = sheetRef.current;
      if (!s.active || !sheet) return;

      dragRef.current.active = false;

      // 移除监听器
      window.removeEventListener("mousemove", onNativeMove);
      window.removeEventListener("mouseup", onNativeUp);
      window.removeEventListener("touchmove", onNativeTouchMove);
      window.removeEventListener("touchend", onNativeUp);

      const single = singleRef.current;
      const curSpread = spreadRef.current;
      const curStep = single ? 1 : 2;
      const can = canRef.current;

      // 单页 tap 边缘翻页
      if (single && !s.dir && Math.abs(s.lastDeltaX) < 15) {
        const c = containerRef.current!;
        const rect = c.getBoundingClientRect();
        const localX = s.startX - rect.left;
        if (localX < rect.width * 0.2 && can.canPrev) { snapFlip("prev"); return; }
        if (localX > rect.width * 0.8 && can.canNext) { snapFlip("next"); return; }
        return;
      }

      // Pure click（无拖拽）
      if (!s.flipInitiated) {
        if (s.dir) snapFlip(s.dir);
        return;
      }

      // Drag：检查角度决定翻还是弹回
      const m = sheet.style.transform.match(/rotateY\(([-\d.]+)deg\)/);
      const curAng = m ? Math.abs(parseFloat(m[1])) : 0;
      const dir = s.dir!;
      const sign = dir === "next" ? -1 : 1;
      const willFlip = curAng > 90;

      animRef.current = true;

      if (willFlip) {
        sheet.style.transition = "transform 200ms cubic-bezier(0.33, 0.1, 0.33, 1)";
        sheet.style.transform = `rotateY(${sign * 180}deg)`;

        safeTransitionEnd(sheet, 220, () => {
          const newSpread = dir === "next" ? curSpread + curStep : curSpread - curStep;
          flushSync(() => setSpread(newSpread));
          setFlipping(null);
          animRef.current = false;
          setPendingReset({ side: sheetSideRef.current });
        });
      } else {
        // 弹回：spread 不变，只需清 flipping + animRef
        sheet.style.transition = "transform 200ms cubic-bezier(0.33, 0.1, 0.33, 1)";
        sheet.style.transform = "rotateY(0deg)";
        safeTransitionEnd(sheet, 220, () => {
          animRef.current = false;
          setFlipping(null);
          setPendingReset({ side: sheetSideRef.current });
        });
      }
    };

    const onNativeUp = () => handleUp();

    // 保存原生适配层引用供 pointerdown 绑定时使用
    nativeMoveRef.current = onNativeMove;
    nativeTouchMoveRef.current = onNativeTouchMove;
    nativeUpRef.current = onNativeUp;

    return () => {
      // 组件卸载时清理
    };
  }, [snapFlip]);

  // 原生事件适配层引用（pointerdown 时绑定，handleUp 里解绑）
  const nativeMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const nativeTouchMoveRef = useRef<((e: TouchEvent) => void) | null>(null);
  const nativeUpRef = useRef<(() => void) | null>(null);

  // === 键盘事件 ===
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (animRef.current || dragRef.current.active) return;
      const can = canRef.current;
      if (e.key === "ArrowRight" && can.canNext) snapFlip("next");
      if (e.key === "ArrowLeft" && can.canPrev) snapFlip("prev");
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, snapFlip]);

  // === pointerdown ===
  const onPointerDown = useCallback((clientX: number, clientY: number) => {
    if (animRef.current || dragRef.current.active) return;
    const c = containerRef.current;
    if (!c) return;

    const rect = c.getBoundingClientRect();
    const single = singleRef.current;
    const can = canRef.current;

    let dir: "next" | "prev" | null = null;
    if (!single) {
      const midX = rect.left + rect.width / 2;
      dir = clientX > midX ? "next" : "prev";
      if (dir === "next" && !can.canNext) return;
      if (dir === "prev" && !can.canPrev) return;
    } else {
      const localX = clientX - rect.left;
      if (localX < rect.width * 0.2 && can.canPrev) { dir = "prev"; }
      else if (localX > rect.width * 0.8 && can.canNext) { dir = "next"; }
    }

    dragRef.current = { active: true, dir, startX: clientX, startY: clientY, lastDeltaX: 0, flipInitiated: false };

    // 用原生适配层绑定（和 handleUp 里解绑的是同一份引用）
    const nativeMove = nativeMoveRef.current;
    const nativeTouchMove = nativeTouchMoveRef.current;
    const nativeUp = nativeUpRef.current;
    if (nativeMove) window.addEventListener("mousemove", nativeMove);
    if (nativeUp) {
      window.addEventListener("mouseup", nativeUp);
      window.addEventListener("touchend", nativeUp);
    }
    if (nativeTouchMove) {
      window.addEventListener("touchmove", nativeTouchMove, { passive: false });
    }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onPointerDown(e.clientX, e.clientY);
  }, [onPointerDown]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) onPointerDown(t.clientX, t.clientY);
  }, [onPointerDown]);

  // === 空态 ===
  if (total === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-800">
        <div className="text-center text-stone-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>这里还没有内容～</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 rounded-full bg-stone-700 text-stone-200 text-sm hover:bg-stone-600">
            返回书柜
          </button>
        </div>
      </div>
    );
  }

  const perspective = "2200px";

  // === 页码显示（双页："3–4 / 20"；单页："3 / 20"） ===
  const leftIdx = isSinglePage ? spread : spread - 1;
  const rightIdx = spread;
  const visibleNos = [leftIdx, rightIdx].filter((n) => n >= 0 && n < total);
  const pageLabel = visibleNos.length
    ? (visibleNos[0] === visibleNos[visibleNos.length - 1]
        ? `${visibleNos[0] + 1}`
        : `${visibleNos[0] + 1}–${visibleNos[visibleNos.length - 1] + 1}`) + ` / ${total}`
    : "封面";

  // === 前一篇 / 后一篇提示 ===
  const prevDiary = spread - step >= 0 ? diaries[spread - 1] : null;
  const nextDiary = spread + step <= total ? diaries[Math.min(total - 1, spread + step)] : null;

  // === 渲染 ===
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-800 select-none">
      <header className="flex items-center justify-between px-4 py-3 bg-stone-900/90 text-stone-200 border-b border-stone-700/60 shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-stone-700/60 transition">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">书柜</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">{bookIcon}</span>
          <span className="font-medium">{bookTitle}</span>
          <span className="text-stone-400 text-sm">· {pageLabel}</span>
        </div>
        <button
          onClick={() => canPrev && snapFlip("prev")}
          disabled={!canPrev}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition ${canPrev ? "hover:bg-stone-700/60" : "opacity-20"}`}
          aria-label="上一页"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center px-2 sm:px-4 py-2 sm:py-4 overflow-hidden">
        <div
          ref={containerRef}
          className="book-container"
          style={{ perspective }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div
            className="book-spine"
            style={{
              background: `linear-gradient(to right, ${bookTheme.spine}cc, ${bookTheme.spine} 3px, transparent 3px, transparent)`,
            }}
          />

          {/* 底层左页（封面 / 上一篇） */}
          {!isSinglePage && (
            <div className="book-page book-page-left" style={{ background: bookTheme.pageBg }}>
              {bottomLeft ? (
                <>
                  <PageContent diary={bottomLeft} pageNumber={bottomLeftNum} onEdit={onEdit} />
                  <PaperTexture />
                </>
              ) : (
                <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
              )}
            </div>
          )}

          {/* 底层右页（下一篇 / 封底） */}
          <div className="book-page book-page-right" style={{ background: bookTheme.pageBg }}>
            {bottomRight ? (
              <>
                <PageContent diary={bottomRight} pageNumber={bottomRightNum} onEdit={onEdit} />
                <PaperTexture />
              </>
            ) : (
              <BackCoverPage theme={bookTheme} />
            )}
          </div>

          {/* Sheet：翻页的纸，正反面由纯推导得出 */}
          <div
            ref={sheetRef}
            className={`book-sheet ${sheetSideRef.current === "left" ? "book-sheet-left" : "book-sheet-right"}`}
            style={{
              background: bookTheme.pageBg,
              transformStyle: "preserve-3d",
              transformOrigin: sheetOriginRef.current,
              willChange: "transform",
            }}
          >
            {/* 正面（0° 可见） */}
            <div
              className="book-face"
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                background: bookTheme.pageBg,
              }}
            >
              {sheetFront ? (
                <>
                  <PageContent diary={sheetFront} pageNumber={sheetFrontNum} onEdit={onEdit} />
                  <PaperTexture />
                </>
              ) : sheetFrontIdx < 0 ? (
                <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
              ) : (
                <BackCoverPage theme={bookTheme} />
              )}
            </div>

            {/* 背面（180° 可见） */}
            <div
              className="book-face book-face-back"
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: bookTheme.pageBg,
              }}
            >
              {sheetBack ? (
                <>
                  <PageContent diary={sheetBack} pageNumber={sheetBackNum} onEdit={onEdit} />
                  <PaperTexture />
                </>
              ) : sheetBackIdx < 0 ? (
                <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
              ) : sheetBackIdx >= total ? (
                <BackCoverPage theme={bookTheme} />
              ) : null}
            </div>

            {/* 折痕阴影 */}
            <div
              className="book-fold-shadow"
              style={{
                background: flipping
                  ? `linear-gradient(to ${flipping === "next" ? "left" : "right"}, ${bookTheme.pageShadow} 0%, transparent 60%)`
                  : "transparent",
              }}
            />
          </div>

          <div
            className="book-shadow"
            style={{ boxShadow: `0 30px 80px -10px ${bookTheme.pageShadow}, 0 0 0 1px rgba(0,0,0,0.06)` }}
          />
        </div>
      </div>

      <footer className="px-4 py-3 bg-stone-900/90 border-t border-stone-700/60 shrink-0">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {canPrev && prevDiary && (
            <span className="text-xs text-stone-400 hover:text-stone-200 cursor-pointer shrink-0 hidden sm:inline" onClick={() => snapFlip("prev")}>
              ← {prevDiary.title?.slice(0, 6) || "前一页"}
            </span>
          )}
          <div className="flex-1 h-1.5 bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.min(((spread + step) / total) * 100, 100)}%`, background: bookTheme.accent }}
            />
          </div>
          {canNext && nextDiary && (
            <span className="text-xs text-stone-400 hover:text-stone-200 cursor-pointer text-right truncate max-w-[30%] hidden sm:inline" onClick={() => snapFlip("next")}>
              {nextDiary.title?.slice(0, 6) || "下一页"} →
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}



