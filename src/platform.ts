/**
 * 平台适配层（Platform Adapter Layer）
 * ================================================================
 * 🎯 唯一允许写「平台差异判断」的文件。
 *
 * 为什么有这个文件
 * ----------------
 * App 与 Web 共用同一份 `src/`。若业务组件里到处写
 * `if (isApp) {...} else {...}`，会造成：
 *   1. Web 端同事 pull 代码后被安卓分支干扰，不敢改、容易改坏
 *   2. 两边同时改同一文件 → git 冲突 → 功能丢失
 *   3. 半年后没人说得清哪些是平台差异
 *
 * 用法
 * ----
 * 业务组件只「问能力」，不判断平台：
 *
 *   import { platform } from "./platform";
 *
 *   if (platform.capabilities.camera) {
 *     await platform.camera.takePhoto();
 *   }
 *
 * 规矩（团队约定）
 * ----------------
 *   ✅ 平台差异 → 写在本文件
 *   ❌ 业务组件 → 一律通过 platform.* 访问，不写平台判断
 *   ❌ 除本文件外，不新增 if (isApp) / capacitor:// 判断
 *
 * 相关文档：docs/APP-SYNC-RULES.md
 */

// ================================================================
// 一、运行环境判定
// ================================================================

/**
 * 是否为 Capacitor 原生 App（安卓/ios）。
 * 判定方式：Capacitor 注入的全局对象。
 * 注意：不能用 `location.hostname === "localhost"` ——
 *      WebView 的 hostname 恒为 localhost，普通开发服务器也可能是 localhost，会误判。
 */
export const isNativeApp: boolean = (() => {
  const w = window as any;
  if (w?.Capacitor?.isNativePlatform) {
    try {
      return Boolean(w.Capacitor.isNativePlatform());
    } catch {
      return false;
    }
  }
  // 兜底：Capacitor 注入的全局桥接对象
  return Boolean(w?.Capacitor);
})();

export const isWeb: boolean = !isNativeApp;

/** 平台标识：'android' | 'ios' | 'web' */
export const platformName: "android" | "ios" | "web" = (() => {
  if (!isNativeApp) return "web";
  const w = window as any;
  const p = String(w?.Capacitor?.getPlatform?.() || "android").toLowerCase();
  return p === "ios" ? "ios" : "android";
})();

// ================================================================
// 二、后端环境判定
// ================================================================

/** VITE_API_BASE：仅 App 副本的 .env.production 提供 */
const envBase = (import.meta as unknown as {
  env?: { VITE_API_BASE?: string };
}).env?.VITE_API_BASE;

/**
 * 是否连的是「测试后端」。
 * 判据 = 实际打哪个后端，**不能**用 hostname（原代码用 hostname 导致
 * WebView 恒为 localhost → App 被误判成 dev → token 存错 key）。
 */
export const isDevBackend: boolean = envBase === undefined && import.meta.env.DEV;

// ================================================================
// 三、token 存储
// ================================================================

/**
 * token 在 localStorage 里的 key。
 * prod/dev 的 Worker 用不同 JWT_SECRET，token 不能混用。
 */
export const TOKEN_KEY: string = isDevBackend
  ? "mydiary-web-dev:auth:token"
  : "mydiary-web:auth:token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式等场景 localStorage 不可用 */
  }
}

// ================================================================
// 四、能力清单
// ================================================================

/**
 * 各平台能力支持情况。
 * 业务组件问这里拿能力，不自己探测。
 */
export const capabilities = {
  /**
   * 浏览器原生语音识别（Web Speech API）。
   * ⚠️ Android WebView **不支持** → App 里为 false。
   *    这就是「语音快记在 App 里报 not-allowed」的根本原因。
   *    EditorPage / ProfilePage 已做能力检测并自动降级；
   *    VoiceQuickEntry 尚未做（待修）。
   */
  speechRecognition:
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),

  /** 录音（MediaRecorder + getUserMedia）。WebView 支持 ✅ */
  audioRecording:
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== "undefined" &&
    typeof (window as any).MediaRecorder !== "undefined",

  /** 相机/相册选图（<input type="file">）。两边都支持 ✅ */
  imagePick:
    typeof document !== "undefined" &&
    Boolean(document.querySelector('input[type="file"]')),

  /** 原生分享（待接入 Capacitor Share 插件） */
  nativeShare: false,

  /** 本地通知 / 推送（待接入） */
  pushNotification: false,
} as const;

// ================================================================
// 五、平台专属动作
// ================================================================

/**
 * 切回前台时触发。
 *
 * 为什么要封装在平台层
 * ------------------
 * Web 端切回前台有 `window.focus`，但 Android WebView 被切到后台再回来
 * **不会稳定触发 focus**（WebView 生命周期与普通网页不同），必须靠
 * `visibilitychange`。两端都要这个能力 → 属于跨端通用封装。
 *
 * 这里同时监听两个事件（幂等）：
 *   - `visibilitychange`：App 切后台再回来时可靠触发
 *   - `window.focus`：Web 切标签页/从其他窗口回来时触发
 * 某些场景两者都会触发，**回调方需自行做「同一时刻只处理一次」的幂等**。
 *
 * @param cb 切回前台时调用
 * @returns 取消订阅函数（React useEffect 清理用）
 */
export function onAppResume(cb: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", cb);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", cb);
  };
}

// ================================================================
// 六、统一导出
// ================================================================

export const platform = {
  isNativeApp,
  isWeb,
  isDevBackend,
  name: platformName,
  capabilities,
  getToken,
  setToken,
  onAppResume,
} as const;

export default platform;
