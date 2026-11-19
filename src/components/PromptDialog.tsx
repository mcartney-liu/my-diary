import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerModalClose } from "../uiModalStack";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  /** 输入框类型：数字键盘 / 普通文本 */
  inputType?: "number" | "text";
  defaultValue?: string;
  placeholder?: string;
  /** 单位后缀，例如「天」 */
  suffix?: string;
  confirmText?: string;
  cancelText?: string;
  /** 校验失败时的提示（由调用方在 onSubmit 里设置 error 控制） */
  error?: string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * 页内输入弹窗 —— 替代 window.prompt。
 * 背景：Android WebView 里 window.prompt 常常不弹（直接返回 null），
 * 功能会静默失效；而且原生弹窗样式和纸感 UI 完全割裂。
 */
export default function PromptDialog({
  open,
  title,
  message,
  inputType = "text",
  defaultValue = "",
  placeholder,
  suffix,
  confirmText = "确定",
  cancelText = "取消",
  error = null,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // 安卓硬件返回键：弹窗开着时优先关闭弹窗
  useEffect(() => {
    if (!open) return;
    return registerModalClose(onCancel);
  }, [open, onCancel]);

  // 每次打开都重置成默认值，并自动聚焦（安卓上聚焦才会弹数字键盘）
  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }, 60);
    return () => clearTimeout(t);
  }, [open, defaultValue]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-[fade-in_0.15s]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative w-full max-w-sm bg-paper-card rounded-2xl shadow-2xl overflow-hidden animate-[modal-pop_0.2s_ease-out_both]">
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-lg font-semibold text-paper-ink text-center">{title}</h3>
        </div>

        {message && (
          <div className="px-5 pb-3">
            <p className="text-sm text-paper-ink2 text-center leading-relaxed whitespace-pre-line">
              {message}
            </p>
          </div>
        )}

        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 rounded-xl border border-paper-line bg-paper-surface px-3 py-2 focus-within:border-paper-accent transition">
            <input
              ref={inputRef}
              type={inputType}
              inputMode={inputType === "number" ? "numeric" : "text"}
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(value); }}
              className="flex-1 min-w-0 bg-transparent outline-none text-base text-paper-ink placeholder:text-paper-ink3"
            />
            {suffix && <span className="shrink-0 text-sm text-paper-ink2">{suffix}</span>}
          </div>
          {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
        </div>

        <div className="flex border-t border-paper-line">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-paper-ink2 hover:bg-paper-surface active:scale-95 transition text-sm font-medium"
          >
            {cancelText}
          </button>
          <div className="w-px bg-paper-line" />
          <button
            onClick={() => onSubmit(value)}
            className="flex-1 py-3.5 bg-paper-accent text-white hover:opacity-90 active:scale-95 transition text-sm font-medium"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
