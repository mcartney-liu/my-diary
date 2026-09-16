import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./AuthContext";
import "./index.css";

// 🖋️ 启动时立即恢复用户选择的字体（避免首屏闪烁）
const savedFont = localStorage.getItem("mydiary_font");
if (savedFont && ["hand", "pen", "sans"].includes(savedFont)) {
  document.body.setAttribute("data-font", savedFont);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
