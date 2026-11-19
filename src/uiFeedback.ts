/**
 * 页内反馈层（逻辑部分，不含 JSX）
 *
 * 为什么要有它：
 * - 原生 alert/confirm 是浏览器画的，样式与纸感 UI 完全割裂；阻塞 JS 线程；
 *   安卓硬件返回键关不掉它（返回键会落到我们自己注册的 handler 上，弹窗还留在屏幕上）
 * - Android WebView 里 window.prompt 常常直接返回 null，功能会静默失效
 * - 这里统一成纸感 toast + 页内确认/输入弹窗，位置沿用 snack-safe（浮在常驻底栏上方）
 *
 * 用法（一行替换，调用方不需要维护 state）：
 *   import { toast, notify, confirmAsync, promptAsync } from "../uiFeedback";
 *   toast("已保存", "ok");                                             // 轻提示，自动消失
 *   notify("麦克风被禁用了，请到设置里打开权限");                        // 需要用户读完，带「知道了」
 *   if (!(await confirmAsync({ title: "删除", message: "…" }))) return;  // 需要用户做决定
 *   const name = await promptAsync({ title: "改名", defaultValue: 旧名 }); // 需要用户输入，取消返回 null
 */

export type ToastTone = "info" | "ok" | "error";

export type ToastItem = { id: number; msg: string; tone: ToastTone; leaving?: boolean };
export type NoticeItem = { id: number; title: string; message: string };
export type ConfirmReq = {
  id: number;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: "default" | "danger";
};
export type PromptReq = {
  id: number;
  title: string;
  message?: string;
  defaultValue?: string;
  inputType?: "number" | "text";
  placeholder?: string;
  suffix?: string;
  confirmText?: string;
  cancelText?: string;
};
export type FeedbackState = {
  toasts: ToastItem[];
  notice: NoticeItem | null;
  confirm: ConfirmReq | null;
  prompt: PromptReq | null;
};

// ---- 极简 store（模块级单例，避免给每个调用点都挂 provider）----
let seq = 0;
let state: FeedbackState = { toasts: [], notice: null, confirm: null, prompt: null };
let confirmResolver: ((v: boolean) => void) | null = null;
let promptResolver: ((v: string | null) => void) | null = null;
const listeners = new Set<() => void>();

const emit = (patch: Partial<FeedbackState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function subscribeFeedback(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getFeedbackState() {
  return state;
}

export function toast(msg: string, tone: ToastTone = "info") {
  const id = ++seq;
  // 最多同时显示 3 条，多了挤掉最早的
  const next = [...state.toasts.slice(-2), { id, msg, tone }];
  emit({ toasts: next });
  // 先标记 leaving 触发淡出，再移除
  window.setTimeout(() => {
    emit({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    });
    window.setTimeout(() => {
      emit({ toasts: state.toasts.filter((t) => t.id !== id) });
    }, 200);
  }, 2800);
}

/** 需要用户读完再走的提示（长文案 / 权限问题），带一个「知道了」 */
export function notify(message: string, title = "提示") {
  emit({ notice: { id: ++seq, title, message } });
}

export function closeNotice() {
  emit({ notice: null });
}

export function confirmAsync(opts: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: "default" | "danger";
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // 同一时刻只允许一个确认框：前一个以「取消」收尾，避免 promise 悬空
    confirmResolver?.(false);
    confirmResolver = resolve;
    emit({ confirm: { id: ++seq, ...opts } });
  });
}

export function settleConfirm(v: boolean) {
  const r = confirmResolver;
  confirmResolver = null;
  emit({ confirm: null });
  r?.(v);
}

/** 页内输入弹窗。取消 / 安卓返回键关闭都返回 null */
export function promptAsync(opts: {
  title: string;
  message?: string;
  defaultValue?: string;
  inputType?: "number" | "text";
  placeholder?: string;
  suffix?: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    promptResolver?.(null); // 同一时刻只留一个，前一个按取消收尾
    promptResolver = resolve;
    emit({ prompt: { id: ++seq, ...opts } });
  });
}

export function settlePrompt(v: string | null) {
  const r = promptResolver;
  promptResolver = null;
  emit({ prompt: null });
  r?.(v);
}
