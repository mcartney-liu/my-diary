import { useEffect } from "react";
import { createPortal } from "react-dom";
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
  closeOnMask?: boolean;
  showClose?: boolean;
  /** 大弹窗用：标题固定，内容区可滚动 */
  scrollable?: boolean;
  /** 固定在底部的按钮区（scrollable 模式下始终可见） */
  footer?: ReactNode;
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
  footer = null,
  className = "",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  // 有 footer 时也需要 flex-col 布局，让 footer 固定在底部
  const needFlexCol = scrollable || !!footer;

  const modalBodyCls = needFlexCol
    ? "max-h-[85vh] flex flex-col"
    : "max-h-[85vh]";

  const contentCls = scrollable
    ? "flex-1 min-h-0 overflow-y-auto"
    : "";

  // ⚠️ 用 Portal 渲染到 document.body
  // 原因：祖先 <main> 有 transform: matrix(1,0,0,1,0,0)
  // transform 会让后代的 position: fixed 变成相对祖先定位，而不是相对视口！
  // Portal 让 Modal 脱离祖先，fixed 正确工作
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fade-in_0.15s]">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeOnMask ? onClose : undefined}
      />

      {/* 弹窗主体 */}
      <div
        className={
          "relative animate-[modal-pop_0.2s_ease-out_both] " +
          "w-full " + SIZE_MAP[size] + " " +
          modalBodyCls + " " +
          "bg-paper-card rounded-2xl shadow-2xl " +
          className
        }
      >
        {/* Header */}
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

        {/* Content */}
        <div className={contentCls}>{children}</div>

        {/* Footer — 固定在底部（scrollable 模式下永远可见） */}
        {footer !== null && (
          <div className="shrink-0 border-t border-paper-line/60">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
