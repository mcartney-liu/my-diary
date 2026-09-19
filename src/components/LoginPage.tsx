import { useState } from "react";
import { useAuth } from "../AuthContext";

type Mode = "login" | "register";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email || !password) { setError("请填写邮箱和密码"); return; }
    if (mode === "register" && password.length < 6) { setError("密码至少 6 位"); return; }
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, nickname || undefined);
    } catch (e: any) {
      const msg = e.message || "登录失败";
      // 后端返回 "409: ...already..." → 友好提示
      setError(msg.includes("409") || msg.includes("already") ? "这个邮箱已经注册了" : msg.replace(/^\d+:\s*/, ""));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center p-4">
      {/* 纸 */}
      <div className="w-full max-w-md bg-paper-bg rounded-2xl shadow-xl border border-paper-line p-8">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📒</div>
          <h1 className="text-xl font-bold text-paper-ink">MyDiary</h1>
          <p className="text-xs text-paper-ink2 mt-1">登录后数据自动云端同步 · 永不丢失</p>
        </div>

        {/* 切换 */}
        <div className="flex bg-paper-surface rounded-xl p-1 mb-6 border border-paper-line">
          {(["login", "register"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 text-sm rounded-lg transition ${
                mode === m ? "bg-paper-accent/20 text-paper-ink font-medium" : "text-paper-ink2"
              }`}
            >
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="text-[11px] text-paper-ink3 mb-1 block">昵称（可选）</label>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="你的名字"
                className="w-full bg-paper-surface rounded-xl border border-paper-line px-3 py-2.5 text-sm text-paper-ink outline-none focus:border-paper-accent"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] text-paper-ink3 mb-1 block">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-paper-surface rounded-xl border border-paper-line px-3 py-2.5 text-sm text-paper-ink outline-none focus:border-paper-accent"
            />
          </div>

          <div>
            <label className="text-[11px] text-paper-ink3 mb-1 block">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "login" ? "你的密码" : "至少 6 位"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onKeyDown={e => e.key === "Enter" && submit()}
              className="w-full bg-paper-surface rounded-xl border border-paper-line px-3 py-2.5 text-sm text-paper-ink outline-none focus:border-paper-accent"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2 border border-red-200">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-paper-accent text-white text-sm font-medium active:scale-95 transition disabled:opacity-60 disabled:active:scale-100 mt-2"
          >
            {loading ? "..." : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </div>

        <div className="mt-5 text-center text-[11px] text-paper-ink3">
          或继续以<strong className="text-paper-ink">访客</strong>身份使用（数据仅存本机）
        </div>
      </div>
    </div>
  );
}
