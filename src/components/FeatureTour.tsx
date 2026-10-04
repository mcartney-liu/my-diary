import { useEffect, useRef, useState } from "react";

/**
 * 主界面功能引导——SVG mask 挖洞 + 高亮目标
 * 视觉规范对齐 TRAE / WorkBuddy / Material Design onboarding
 */

export interface TourStep {
  selector: string;
  title: string;
  description: string;
}

interface Props {
  steps: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
  open: boolean;
}

const STORAGE_KEY = "mydiary.has_seen_tour";

export function hasSeenTour(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
export function markTourSeen() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

/** 视觉常量 —— 对齐成熟产品规范 */
const VISUAL = {
  MASK_OPACITY: 0.72,          // 遮罩浓度：TRAE/MD 统一 0.72
  HOLE_PAD: 8,                 // 挖洞比目标大多少：8px 紧贴不浪费屏幕
  HOLE_RADIUS: 16,             // 高亮圆角：Mac 风格大圆角
  ARROW_SIZE: 8,               // 箭头尺寸：8×8 精致三角
  BUBBLE_WIDTH: 280,           // 气泡宽度：280px（比 300 稍窄更紧凑）
  BUBBLE_GAP: 16,              // 气泡与目标间距
};

export default function FeatureTour({ steps, onFinish, onSkip, open }: Props) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const target = document.querySelector(steps[idx]?.selector);
      if (target) {
        const r = target.getBoundingClientRect();
        setRect(r);

        const W = window.innerWidth;
        const H = window.innerHeight;
        const safePad = 20;

        // 气泡位置：默认在目标下方
        let top = r.bottom + VISUAL.BUBBLE_GAP;
        // 超出底部 → 放到目标上方
        if (top + 170 > H - safePad) {
          top = r.top - 170;
        }
        let left = r.left + r.width / 2 - VISUAL.BUBBLE_WIDTH / 2;
        left = Math.max(safePad, Math.min(left, W - VISUAL.BUBBLE_WIDTH - safePad));
        setBubblePos({ top: Math.max(safePad + 44, top), left });

        // 滚动到目标可见
        const cy = r.top + r.height / 2;
        if (cy < 140 || cy > H - 160) {
          window.scrollTo({ top: window.scrollY + cy - H / 2, behavior: "smooth" });
        }
      } else {
        setRect(null);
        setBubblePos(null);
      }
    };

    rafRef.current = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, idx, steps]);

  if (!open) return null;

  const step = steps[idx];
  const W = window.innerWidth;
  const H = window.innerHeight;

  // 挖洞区域
  const hole = rect ? {
    x: rect.left - VISUAL.HOLE_PAD,
    y: rect.top - VISUAL.HOLE_PAD,
    w: rect.width + VISUAL.HOLE_PAD * 2,
    h: rect.height + VISUAL.HOLE_PAD * 2,
  } : null;

  const bubbleAbove = bubblePos && rect && bubblePos.top < rect.top;

  // 箭头水平居中指向高亮框中心（相对气泡 left 坐标）
  const arrowLeft = hole && bubblePos
    ? Math.max(12, Math.min(hole.x + hole.w / 2 - VISUAL.ARROW_SIZE / 2 - bubblePos.left, VISUAL.BUBBLE_WIDTH - 20))
    : VISUAL.BUBBLE_WIDTH / 2 - VISUAL.ARROW_SIZE / 2;

  const isLast = idx === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90]">
      {/* SVG mask 遮罩 */}
      <svg
        className="absolute inset-0 pointer-events-auto"
        width={W}
        height={H}
        style={{ display: "block" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width={W} height={H} fill="white" />
            {hole && (
              <rect
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={VISUAL.HOLE_RADIUS}
                ry={VISUAL.HOLE_RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width={W}
          height={H}
          fill={`rgba(0,0,0,${VISUAL.MASK_OPACITY})`}
          mask="url(#tour-mask)"
        />
      </svg>

      {/* 跳过 —— 低调纯文字 */}
      <button
        onClick={onSkip}
        className="absolute top-4 right-4 z-[91] text-white/60 text-[11px] px-2 py-1 active:opacity-40"
      >
        跳过
      </button>

      {/* 高亮描边：2px 纯白 + 柔和外发光 */}
      {hole && (
        <div
          className="absolute pointer-events-none border-2 border-white z-[91]"
          style={{
            top: hole.y,
            left: hole.x,
            width: hole.w,
            height: hole.h,
            borderRadius: VISUAL.HOLE_RADIUS,
            boxShadow: "0 0 0 4px rgba(255,255,255,0.12), 0 4px 20px rgba(0,0,0,0.3)",
          }}
        />
      )}

      {/* 气泡 */}
      {step && bubblePos && (
        <div
          className="absolute z-[92] bg-white rounded-xl p-4"
          style={{
            top: bubblePos.top,
            left: bubblePos.left,
            width: VISUAL.BUBBLE_WIDTH,
            boxShadow: "0 8px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
            border: "none",
          }}
        >
          {/* 箭头 —— 只有纯填充三角，无边框更干净 */}
          {hole && bubbleAbove && (
            // 气泡在目标上 → 箭头贴气泡底，指向下 ▼
            <svg
              className="absolute"
              width={VISUAL.ARROW_SIZE}
              height={VISUAL.ARROW_SIZE - 2}
              style={{ left: arrowLeft, top: "100%", transform: "translateY(-1px)" }}
            >
              <path d={`M0,0 L${VISUAL.ARROW_SIZE},0 L${VISUAL.ARROW_SIZE / 2},${VISUAL.ARROW_SIZE - 2} Z`} fill="white" />
            </svg>
          )}
          {hole && !bubbleAbove && (
            // 气泡在目标下 → 箭头贴气泡顶，指向上 ▲
            <svg
              className="absolute"
              width={VISUAL.ARROW_SIZE}
              height={VISUAL.ARROW_SIZE - 2}
              style={{ left: arrowLeft, top: -(VISUAL.ARROW_SIZE - 3) }}
            >
              <path d={`M0,${VISUAL.ARROW_SIZE - 2} L${VISUAL.ARROW_SIZE},${VISUAL.ARROW_SIZE - 2} L${VISUAL.ARROW_SIZE / 2},0 Z`} fill="white" />
            </svg>
          )}

          {/* 内容 */}
          <h4 className="text-[14px] font-semibold text-paper-ink leading-snug">{step.title}</h4>
          <p className="text-[12px] text-paper-ink2 mt-2 leading-[1.6]">{step.description}</p>

          {/* 底部：进度 + 下一步 */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] text-paper-ink3 font-normal">
              {idx + 1} / {steps.length}
            </span>
            <button
              onClick={() => isLast ? onFinish() : setIdx(idx + 1)}
              className="px-[14px] py-[6px] rounded-full bg-paper-ink text-paper-bg text-[12px] font-medium transition active:scale-[0.96]"
            >
              {isLast ? "开始使用" : "下一步 →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
