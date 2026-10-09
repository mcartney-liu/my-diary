import { useState, useEffect, useCallback, useRef } from "react";
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
 *  用 timeout 兜底强制执行 cleanup callback，避免 animRef 永远 true 卡死 */
function safeTransitionEnd(
  el: HTMLElement,
  timeoutMs: number,
  callback: (e?: TransitionEvent) => void
) {
  let done = false;
  const once = (e: TransitionEvent) => {
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

export default function BookReader({
  diaries, bookTitle, bookIcon, bookTheme, onClose, onEdit,
}: Props) {
  const [pageIndex, setPageIndex] = useState(0);
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

  // ====== 锁内容的 ref ======
  const sheetBackRef = useRef<Diary | null>(null);
  const sheetBackPageNumRef = useRef<number>(0);
  const lockedPrevRef = useRef<Diary | null | undefined>(undefined);
  const lockedPrevNumRef = useRef<number>(0);
  const lockedNextRef = useRef<Diary | null | undefined>(undefined);
  const lockedNextNumRef = useRef<number>(0);
  const lockedBottomDirRef = useRef<"next" | "prev" | null>(null);

  const sheetSideRef = useRef<"left" | "right">("right");
  const sheetOriginRef = useRef("left center");
  const moveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const tMoveRef = useRef<((e: TouchEvent) => void) | null>(null);
  const upRef = useRef<(() => void) | null>(null);
  const dragRef = useRef({
    active: false,
    dir: null as "next" | "prev" | null,
    startX: 0,
    startY: 0,
    lastDeltaX: 0,
    flipInitiated: false,
  });

  const total = diaries.length;
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < total;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (animRef.current || dragRef.current.active) return;
      if (e.key === "ArrowRight" && canNext) snapFlip("next");
      if (e.key === "ArrowLeft" && canPrev) snapFlip("prev");
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, canPrev, onClose]);

  const setSheetSide = (dir: "next" | "prev") => {
    const s = sheetRef.current;
    const side = dir === "prev" ? "left" : "right";
    const origin = side === "right" ? "left center" : "right center";
    sheetSideRef.current = side;
    sheetOriginRef.current = origin;
    if (s) {
      s.classList.remove("book-sheet-left", "book-sheet-right");
      s.classList.add(`book-sheet-${side}`);
      s.style.transformOrigin = origin;
    }
  };

  const lockAll = (dir: "next" | "prev", fromIndex: number) => {
    const toIndex = dir === "next" ? fromIndex + 1 : fromIndex - 1;
    // sheet backface 显示"正在翻向的那页"（动画中可见）
    sheetBackRef.current = dir === "next"
      ? (fromIndex + 1 < total ? diaries[fromIndex + 1] : null)
      : (fromIndex > 0 ? diaries[fromIndex - 1] : null);
    sheetBackPageNumRef.current = dir === "next" ? fromIndex + 2 : fromIndex;

    if (isSinglePage) {
      // 单页：底层预放翻完后要露出的那页
      const targetDiary = dir === "next"
        ? (toIndex < total ? diaries[toIndex] : null)
        : (toIndex >= 0 ? diaries[toIndex] : null);
      if (dir === "next") {
        lockedNextRef.current = targetDiary;
        lockedNextNumRef.current = toIndex + 1;
        lockedPrevRef.current = undefined;
      } else {
        lockedPrevRef.current = targetDiary;
        lockedPrevNumRef.current = toIndex + 1;
        lockedNextRef.current = undefined;
      }
      lockedBottomDirRef.current = dir;
    } else {
      // ⭐ 双页：锁 toIndex 周围的内容（翻完后底层应该显示的）
      // 这样 Phase 3 期间底层就是翻完后的样子，unlock 前后无跳变 → 零闪现！
      lockedPrevRef.current = toIndex > 0 ? diaries[toIndex - 1] : null;
      lockedPrevNumRef.current = toIndex;
      lockedNextRef.current = toIndex < total - 1 ? diaries[toIndex + 1] : null;
      lockedNextNumRef.current = toIndex + 2;
      lockedBottomDirRef.current = null;
    }
  };

  const unlockAll = () => {
    sheetBackRef.current = null;
    sheetBackPageNumRef.current = 0;
    lockedPrevRef.current = undefined;
    lockedNextRef.current = undefined;
    lockedBottomDirRef.current = null;
    // ⭐ 翻完后 sheet 回到默认右侧，transformOrigin 也回默认
    sheetSideRef.current = "right";
    sheetOriginRef.current = "left center";
    const s = sheetRef.current;
    if (s) {
      s.classList.remove("book-sheet-left", "book-sheet-right");
      s.classList.add("book-sheet-right");
      s.style.transformOrigin = "left center";
    }
  };

  const snapFlip = useCallback((dir: "next" | "prev") => {
    const sheet = sheetRef.current;
    if (!sheet || animRef.current) return;
    animRef.current = true;
    setFlipping(dir);
    lockAll(dir, pageIndex);

    sheet.style.transition = "none";
    sheet.style.transform = "rotateY(0deg)";
    sheet.style.transformOrigin = dir === "next" ? "left center" : "right center";
    setSheetSide(dir);
    void sheet.offsetWidth;

    const sign = dir === "next" ? -1 : 1;

    sheet.style.transition = "transform 680ms cubic-bezier(0.33, 0.1, 0.33, 1)";
    sheet.style.transform = `rotateY(${sign * 180}deg)`;

    // ⭐ Phase 1: 700ms 超时保护
    safeTransitionEnd(sheet, 700, () => {
      // ⭐ 更新 sheetBackRef 为不同于新正面的内容，避免正反面相同
      if (dir === "next") {
        sheetBackRef.current = pageIndex + 2 < total ? diaries[pageIndex + 2] : null;
        sheetBackPageNumRef.current = pageIndex + 3;
      } else {
        sheetBackRef.current = diaries[pageIndex];
        sheetBackPageNumRef.current = pageIndex + 1;
      }
      sheet.style.transition = "none";
      sheet.style.transform = `rotateY(${-sign * 180}deg)`;
      void sheet.offsetWidth;
      setPageIndex((i) => i + (dir === "next" ? 1 : -1));
      void sheet.offsetWidth;

      sheet.style.transition = "transform 320ms cubic-bezier(0.33, 0.1, 0.33, 1)";
      sheet.style.transform = "rotateY(0deg)";

      // ⭐ Phase 3: 340ms 超时保护
      safeTransitionEnd(sheet, 340, () => {
        animRef.current = false;
        setFlipping(null);
        unlockAll();
      });
    });
  }, [pageIndex, total, isSinglePage]);

  // 跟手翻页
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      const s = dragRef.current;
      const sheet = sheetRef.current;
      if (!s.active || !sheet) return;

      const deltaX = clientX - s.startX;
      const deltaY = clientY - s.startY;
      s.lastDeltaX = deltaX;
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) return;

      if (isSinglePage) {
        if (deltaX < -20 && s.dir !== "next" && canNext) {
          s.dir = "next";
        } else if (deltaX > 20 && s.dir !== "prev" && canPrev) {
          s.dir = "prev";
        }
      }

      if (!s.dir) return;

      // ⭐ Lazy flip init: only set up flip state when drag is detected
      if (!s.flipInitiated && Math.abs(deltaX) > 5) {
        s.flipInitiated = true;
        setFlipping(s.dir);
        setSheetSide(s.dir);
        lockAll(s.dir, pageIndex);
        sheet.style.transition = "none";
        sheet.style.transformOrigin = s.dir === "next" ? "left center" : "right center";
      }

      if (!s.flipInitiated) return;

      const c = containerRef.current!;
      const effective = s.dir === "next" ? -deltaX : deltaX;
      const ratio = Math.min(Math.abs(effective) / (c.clientWidth * 0.6), 1);
      const angle = ratio * 180;

      sheet.style.transition = "none";
      sheet.style.transform = `rotateY(${(s.dir === "next" ? -1 : 1) * angle}deg)`;
    };

    moveRef.current = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    tMoveRef.current = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };
    upRef.current = () => {
      const s = dragRef.current;
      const sheet = sheetRef.current;
      if (!s.active || !sheet) return;

      dragRef.current.active = false;

      if (moveRef.current) window.removeEventListener("mousemove", moveRef.current);
      if (upRef.current) {
        window.removeEventListener("mouseup", upRef.current);
        window.removeEventListener("touchend", upRef.current);
      }
      if (tMoveRef.current) window.removeEventListener("touchmove", tMoveRef.current);

      // 单页 tap 边缘翻页
      if (isSinglePage && !s.dir && Math.abs(s.lastDeltaX) < 15) {
        const c = containerRef.current!;
        const rect = c.getBoundingClientRect();
        const tapX = s.startX - rect.left;
        if (tapX < rect.width * 0.2 && canPrev) { snapFlip("prev"); return; }
        else if (tapX > rect.width * 0.8 && canNext) { snapFlip("next"); return; }
        else { return; }
      }

      // ⭐ Pure click (no drag detected): call snapFlip directly
      if (!s.flipInitiated) {
        if (s.dir) snapFlip(s.dir);
        return;
      }

      // ⭐ Drag: check angle to flip or bounce back
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
          // ⭐ 更新 sheetBackRef 为不同于新正面的内容，避免正反面相同
          if (dir === "next") {
            sheetBackRef.current = pageIndex + 2 < total ? diaries[pageIndex + 2] : null;
            sheetBackPageNumRef.current = pageIndex + 3;
          } else {
            sheetBackRef.current = diaries[pageIndex];
            sheetBackPageNumRef.current = pageIndex + 1;
          }
          sheet.style.transition = "none";
          sheet.style.transform = `rotateY(${-sign * 180}deg)`;
          void sheet.offsetWidth;
          setPageIndex((i) => i + (dir === "next" ? 1 : -1));
          void sheet.offsetWidth;

          sheet.style.transition = "transform 280ms cubic-bezier(0.33, 0.1, 0.33, 1)";
          sheet.style.transform = "rotateY(0deg)";

          safeTransitionEnd(sheet, 300, () => {
            animRef.current = false;
            setFlipping(null);
            unlockAll();
          });
        });
      } else {
        sheet.style.transition = "transform 200ms cubic-bezier(0.33, 0.1, 0.33, 1)";
        sheet.style.transform = "rotateY(0deg)";
        safeTransitionEnd(sheet, 220, () => {
          animRef.current = false;
          setFlipping(null);
          unlockAll();
        });
      }
    };
  }, [pageIndex, total, isSinglePage, canNext, canPrev, snapFlip]);

  const onPointerDown = useCallback((clientX: number, clientY: number) => {
    if (animRef.current || dragRef.current.active) return;
    const c = containerRef.current;
    if (!c) return;

    const rect = c.getBoundingClientRect();

    let dir: "next" | "prev" | null = null;
    if (!isSinglePage) {
      const midX = rect.left + rect.width / 2;
      dir = clientX > midX ? "next" : "prev";
      if (dir === "next" && !canNext) return;
      if (dir === "prev" && !canPrev) return;
    } else {
      const localX = clientX - rect.left;
      if (localX < rect.width * 0.2 && canPrev) { dir = "prev"; }
      else if (localX > rect.width * 0.8 && canNext) { dir = "next"; }
    }

    // ⭐ Lazy: only record intent, do NOT set up flip state yet
    dragRef.current = { active: true, dir, startX: clientX, startY: clientY, lastDeltaX: 0, flipInitiated: false };

    if (moveRef.current) window.addEventListener("mousemove", moveRef.current);
    if (upRef.current) window.addEventListener("mouseup", upRef.current);
    if (tMoveRef.current) window.addEventListener("touchmove", tMoveRef.current, { passive: false });
    if (upRef.current) window.addEventListener("touchend", upRef.current);
  }, [canNext, canPrev, isSinglePage]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onPointerDown(e.clientX, e.clientY);
  }, [onPointerDown]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) onPointerDown(t.clientX, t.clientY);
  }, [onPointerDown]);

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
  const current = diaries[pageIndex];

  let bottomLeft: Diary | null = null;
  let bottomRight: Diary | null = null;
  let bottomLeftNum = 0;
  let bottomRightNum = 0;

  if (isSinglePage) {
    const bottomDir = lockedBottomDirRef.current;
    if (bottomDir === "next") {
      bottomLeft = lockedNextRef.current !== undefined
        ? lockedNextRef.current
        : (pageIndex + 1 < total ? diaries[pageIndex + 1] : null);
      bottomLeftNum = lockedNextRef.current !== undefined ? lockedNextNumRef.current : pageIndex + 2;
      bottomRight = bottomLeft;
      bottomRightNum = bottomLeftNum;
    } else if (bottomDir === "prev") {
      bottomLeft = lockedPrevRef.current !== undefined
        ? lockedPrevRef.current
        : (pageIndex > 0 ? diaries[pageIndex - 1] : null);
      bottomLeftNum = lockedPrevRef.current !== undefined ? lockedPrevNumRef.current : pageIndex;
      bottomRight = bottomLeft;
      bottomRightNum = bottomLeftNum;
    } else {
      // ⭐ 没在翻页：底层预放"下一页"（翻 next 时露出），sheet 盖满看不见
      // 但如果 pageIndex 已经是最后一页，底层放"上一页"（翻 prev 时露出）
      if (pageIndex < total - 1) {
        bottomLeft = diaries[pageIndex + 1];
        bottomLeftNum = pageIndex + 2;
      } else if (pageIndex > 0) {
        bottomLeft = diaries[pageIndex - 1];
        bottomLeftNum = pageIndex;
      } else {
        bottomLeft = null;
        bottomLeftNum = 0;
      }
      bottomRight = bottomLeft;
      bottomRightNum = bottomLeftNum;
    }
  } else {
    bottomLeft = lockedPrevRef.current !== undefined
      ? lockedPrevRef.current
      : (pageIndex > 0 ? diaries[pageIndex - 1] : null);
    bottomLeftNum = lockedPrevRef.current !== undefined
      ? lockedPrevNumRef.current
      : pageIndex;

    bottomRight = lockedNextRef.current !== undefined
      ? lockedNextRef.current
      : (pageIndex < total - 1 ? diaries[pageIndex + 1] : null);
    bottomRightNum = lockedNextRef.current !== undefined
      ? lockedNextNumRef.current
      : pageIndex + 2;
  }

  // back face 内容: 翻页时用 lockAll 设的 sheetBackRef, 静态时用下一篇（和正面不同）
  const defaultBackDiary = sheetSideRef.current === "right" ? bottomRight : bottomLeft;
  const defaultBackNum = sheetSideRef.current === "right" ? bottomRightNum : bottomLeftNum;
  const sheetBackContent = sheetBackRef.current ?? defaultBackDiary;
  const sheetBackContentNum = sheetBackRef.current
    ? sheetBackPageNumRef.current
    : defaultBackNum;

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
          <span className="text-stone-400 text-sm">· {pageIndex + 1} / {total}</span>
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
            <div
              className="book-face"
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                background: bookTheme.pageBg,
              }}
            >
              {current ? (
                <>
                  <PageContent diary={current} pageNumber={pageIndex + 1} onEdit={onEdit} />
                  <PaperTexture />
                </>
              ) : pageIndex === total ? (
                <BackCoverPage theme={bookTheme} />
              ) : pageIndex === -1 ? (
                <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
              ) : null}
            </div>

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
              {sheetBackContent ? (
                <PageContent diary={sheetBackContent} pageNumber={sheetBackContentNum} onEdit={onEdit} />
              ) : null}
              <PaperTexture />
            </div>

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
          {canPrev && (
            <span className="text-xs text-stone-400 hover:text-stone-200 cursor-pointer shrink-0 hidden sm:inline" onClick={() => snapFlip("prev")}>
              ← {pageIndex > 0 ? diaries[pageIndex - 1]?.title?.slice(0, 6) || "前一页" : "前一页"}
            </span>
          )}
          <div className="flex-1 h-1.5 bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${((pageIndex + 1) / total) * 100}%`, background: bookTheme.accent }}
            />
          </div>
          {canNext && (
            <span className="text-xs text-stone-400 hover:text-stone-200 cursor-pointer text-right truncate max-w-[30%] hidden sm:inline" onClick={() => snapFlip("next")}>
              {pageIndex < total - 1 ? diaries[pageIndex + 1]?.title?.slice(0, 6) || "下一页" : "下一页"} →
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}



