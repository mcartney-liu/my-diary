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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
