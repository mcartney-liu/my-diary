import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "./components/ConfirmDialog";
import {
  closeNotice,
  getFeedbackState,
  settleConfirm,
  subscribeFeedback,
  type FeedbackState,
  type ToastTone,
} from "./uiFeedback";

const TONE_BAR: Record<ToastTone, string> = {
  info: "bg-paper-ink",
  ok: "bg-green-600",
  error: "bg-red-500",
};

/**
 * 页内反馈层的渲染宿主：全局只需要在 App 里挂一个。
 * 逻辑（toast / notify / confirmAsync）在 uiFeedback.ts，这里只管画。
 */
export default function UiFeedbackHost() {
  const [state, setState] = useState<FeedbackState>(getFeedbackState);

  useEffect(() => subscribeFeedback(() => setState(getFeedbackState())), []);

  return createPortal(
    <>
      {/* toast 栈：贴着常驻底栏上方往上叠，最多 3 条 */}
      {state.toasts.length > 0 && (
        <div className="fixed snack-safe left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none max-w-[calc(100vw-2rem)]">
          {state.toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`${TONE_BAR[t.tone]} text-white text-xs px-4 py-2 rounded-full shadow-lg text-center leading-relaxed transition-all duration-200 ${
                t.leaving ? "opacity-0 translate-y-1" : "opacity-100"
              }`}
            >
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* 需要读完的提示 */}
      {state.notice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6 animate-[fade-in_0.15s]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeNotice} />
          <div className="relative w-full max-w-sm bg-paper-card rounded-2xl shadow-2xl overflow-hidden animate-[modal-pop_0.2s_ease-out_both]">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-paper-ink text-center">{state.notice.title}</h3>
            </div>
            <div className="px-5 pb-4">
              <p className="text-sm text-paper-ink2 text-center leading-relaxed whitespace-pre-line">
                {state.notice.message}
              </p>
            </div>
            <button
              onClick={closeNotice}
              className="w-full py-3.5 border-t border-paper-line text-paper-ink hover:bg-paper-surface active:scale-95 transition text-sm font-medium"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 需要用户做决定 */}
      <ConfirmDialog
        open={!!state.confirm}
        title={state.confirm?.title ?? ""}
        message={state.confirm?.message ?? ""}
        confirmText={state.confirm?.confirmText}
        cancelText={state.confirm?.cancelText}
        confirmTone={state.confirm?.confirmTone}
        onConfirm={() => settleConfirm(true)}
        onCancel={() => settleConfirm(false)}
      />
    </>,
    document.body
  );
}
