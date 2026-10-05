import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MyDiary — Capacitor 壳配置（Android）
 *
 * ⚠️ 本文件属于「App 开发副本」，位置：
 *    C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android\
 *
 *    与「Web 生产副本」严格隔离：
 *    C:\Users\haizhi\AppData\Roaming\TRAE SOLO CN\...\6aa3cefc66f609d7998640ec\mydiary-web
 *
 *    职责划分：
 *    - Web 生产副本：线上 app.callmydiary.online 跑的代码，永不被套壳改动污染
 *    - 本副本（App 专用）：套壳改动全部集中在这里，出 APK 用
 *
 * 思路：WebView 加载打包进 APK 的 dist 静态资源（webDir），不填 server.url
 *      → App 可完全离线启动，联网仅用于调后端 API。
 *
 * 后端连接：靠 .env.production 注入 VITE_API_BASE=https://app.callmydiary.online
 *          （App 内 import.meta.env.DEV=false，若不注入则 API_BASE 为空串，
 *            相对路径会打到 capacitor://localhost 导致全部请求 404）
 */
const config: CapacitorConfig = {
  appId: "online.callmydiary.app",
  appName: "MyDiary",
  webDir: "dist",

  // 背景色跟 index.html 的 theme-color 一致（#faf6ef 纸感米白），
  // 避免启动瞬间白/黑闪烁割裂手写美学
  backgroundColor: "#faf6ef",

  android: {
    // 允许 WebView 加载的外部域名（后端 API）
    allowNavigation: [
      "app.callmydiary.online",
      "mydiary-api.mcartneyliu.workers.dev",
      "mydiary-api-dev.mcartneyliu.workers.dev",
    ],
    // 真机调试用（连 Chrome devtools 远程调试 WebView），发布前可关
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    // 预留：未来接入推送/原生分享时在此注册
  },
};

export default config;
