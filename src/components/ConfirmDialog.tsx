import { useEffect } from "react";
import { createPortal } from "react-dom";
import { registerModalClose } from "../uiModalStack";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  /** 可选的第三个按钮（例如「不要了」），显示在弹窗底部 */
  secondaryText?: string;
  onSecondary?: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  confirmTone = "default",
  onConfirm,
  onCancel,
  secondaryText,
  onSecondary,
}: Props) {
  // 安卓硬件返回键：弹窗开着时优先关闭弹窗
  useEffect(() => {
    if (!open) return;
    return registerModalClose(onCancel);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClass =
    confirmTone === "danger"
      ? "bg-red-500 text-white hover:bg-red-600"
      : "bg-paper-accent text-white hover:opacity-90";

  // ⚠️ createPortal 渲染到 document.body，脱离祖先 transform 定位上下文
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-[fade-in_0.15s]">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      {/* 弹窗主体 — 用 modal-pop 动画（保留 translate 避免和 transform 冲突） */}
      <div className="relative w-full max-w-sm bg-paper-card rounded-2xl shadow-2xl overflow-hidden animate-[modal-pop_0.2s_ease-out_both]">
        {/* 标题 */}
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-lg font-semibold text-paper-ink text-center">{title}</h3>
        </div>

        {/* 内容 */}
        <div className="px-5 pb-4">
          <p className="text-sm text-paper-ink2 text-center leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex border-t border-paper-line">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-paper-ink2 hover:bg-paper-surface active:scale-95 transition text-sm font-medium"
          >
            {cancelText}
          </button>
          <div className="w-px bg-paper-line" />
          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 active:scale-95 transition text-sm font-medium ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
        {secondaryText && onSecondary && (
          <div className="border-t border-paper-line">
            <button
              onClick={onSecondary}
              className="w-full py-3 text-red-500 hover:bg-red-50 active:scale-95 transition text-sm"
            >
              {secondaryText}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
