import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string | ReactNode;
  size?: ModalSize;
  children: ReactNode;
  /** 点击遮罩是否关闭，默认 true */
  closeOnMask?: boolean;
  /** 显示关闭按钮，默认 true */
  showClose?: boolean;
  /** 内容区域是否可滚动（大弹窗用），默认 false */
  scrollable?: boolean;
  className?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  closeOnMask = true,
  showClose = true,
  scrollable = false,
  className = "",
}: ModalProps) {
  // 移动端键盘适配：用 visualViewport 动态计算弹窗可用区域
  const [vvp, setVvp] = useState({ width: 0, height: 0, offsetTop: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // 1. 锁定 body 滚动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 2. visualViewport 监听（解决 iOS Safari 键盘顶起问题）
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const updateVvp = () => {
      if (vv) {
        setVvp({
          width: vv.width,
          height: vv.height,
          offsetTop: vv.offsetTop,
        });
      } else {
        // 桌面端 fallback
        setVvp({
          width: window.innerWidth,
          height: window.innerHeight,
          offsetTop: 0,
        });
      }
    };
    updateVvp();
    vv?.addEventListener("resize", updateVvp);
    vv?.addEventListener("scroll", updateVvp);
    window.addEventListener("resize", updateVvp);

    // 3. 关闭时清理
    return () => {
      document.body.style.overflow = prevOverflow;
      vv?.removeEventListener("resize", updateVvp);
      vv?.removeEventListener("scroll", updateVvp);
      window.removeEventListener("resize", updateVvp);
    };
  }, [open]);

  if (!open) return null;

  // 根据 visualViewport 计算弹窗位置和最大高度
  // 弹窗居中在 visualViewport 内（键盘上半部分），而不是整个屏幕
  const containerStyle: React.CSSProperties = vvp.width > 0
    ? {
        left: vvp.offsetTop > 0 ? 0 : 0,
        top: vvp.offsetTop,
        width: vvp.width || "100vw",
        height: vvp.height || "100vh",
        position: "fixed",
      }
    : {};

  return (
    <div className="z-50 animate-[fade-in_0.15s]" style={containerStyle}>
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeOnMask ? onClose : undefined}
      />

      {/* 弹窗主体 —— 用 calc 精确居中在 visualViewport 内 */}
      <div
        ref={dialogRef}
        className={
          "absolute " +
          "left-1/2 -translate-x-1/2 " +
          "animate-[drawer-up_0.22s_ease-out] " +
          "w-[calc(100%-2rem)] " +
          SIZE_MAP[size] +
          " bg-paper-card rounded-2xl shadow-2xl overflow-hidden " +
          (scrollable ? "flex flex-col " : "") +
          className
        }
        style={{
          top: `calc(${vvp.height || "100vh"} / 2)`,
          transform: "translate(-50%, -50%)",
          maxHeight: `calc(${vvp.height || "100vh"} - 2rem)`,
        }}
      >
        {/* 有标题时自动渲染 header */}
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-paper-line/60 shrink-0">
            <div className="text-base font-semibold text-paper-ink">{title}</div>
            {showClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-paper-ink3 hover:text-paper-ink hover:bg-paper-surface transition text-lg leading-none"
                aria-label="关闭"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* 内容 */}
        <div className={scrollable ? "flex-1 overflow-y-auto" : ""}>{children}</div>
      </div>
    </div>
  );
}
