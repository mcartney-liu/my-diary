import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./AuthContext";
import "./index.css";

// 🖋️ 启动时立即恢复用户选择的字体（避免首屏闪烁）
// ⚠️ 必须同时设 html 和 body — Tailwind preflight 会给 html 注入 PingFang SC 覆盖手写字体
const savedFont = localStorage.getItem("mydiary_font");
if (savedFont && ["hand", "pen", "sans"].includes(savedFont)) {
  document.documentElement.setAttribute("data-font", savedFont);
  document.body.setAttribute("data-font", savedFont);
}

// 🍎 iOS Safari 字体重绘 hack
// iOS WebKit: font-display: swap + 5.6MB 大字体 = 下载完不自动重绘
// 等所有 @font-face 加载完后，加 .fonts-loaded 触发 -webkit-text-stroke 强制重排
if ((document as any).fonts?.ready) {
  (document as any).fonts.ready.then(() => {
    document.documentElement.classList.add("fonts-loaded");
  });
} else {
  // 老浏览器 fallback：3 秒后强制重绘
  setTimeout(() => document.documentElement.classList.add("fonts-loaded"), 3000);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
