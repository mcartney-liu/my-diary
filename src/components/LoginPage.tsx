import { useState } from "react";
import { useAuth } from "../AuthContext";

type Mode = "login" | "register";

export default function LoginPage() {
  const { login, register, sendCode } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  const startCountdown = () => {
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    setError("");
    setSuccess("");
    setDevCode(null);
    if (!email) { setError("请填邮箱"); return; }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_RE.test(email)) { setError("邮箱格式不对"); return; }
    setLoading(true);
    try {
      const res = await sendCode(email);
      if (res.dev_code) {
        // dev 模式：Worker 没配 Email Sending，返回 mock 验证码
        setDevCode(res.dev_code);
      } else {
        setSuccess("验证码已发送，查收邮箱");
      }
      startCountdown();
    } catch (e: any) {
      const msg = e.message || "发送失败";
      if (msg.includes("409")) setError("这个邮箱已经注册过了");
      else setError(msg.replace(/^\d+:\s*/, ""));
    } finally { setLoading(false); }
  };

  const submit = async () => {
    setError("");
    setSuccess("");
    if (!email || !password) { setError("请填写邮箱和密码"); return; }
    if (mode === "register") {
      if (!code) { setError("请填写验证码"); return; }
      if (password.length < 6) { setError("密码至少 6 位"); return; }
    }
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, code, nickname || undefined);
    } catch (e: any) {
      const msg = e.message || "操作失败";
      const clean = msg.replace(/^\d+:\s*/, "");
      if (msg.includes("409")) setError("这个邮箱已经注册了");
      else if (msg.includes("验证码已过期")) setError("验证码已过期，重新获取一下");
      else if (msg.includes("验证码不对")) setError("验证码不对，再看看邮箱");
      else setError(clean);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center p-4">
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
              onClick={() => { setMode(m); setError(""); setSuccess(""); setCode(""); setDevCode(null); }}
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
          {/* 昵称（注册才显示） */}
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

          {/* 邮箱 */}
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

          {/* 验证码（注册才显示） */}
          {mode === "register" && (
            <div>
              <label className="text-[11px] text-paper-ink3 mb-1 block">邮箱验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 位数字"
                  inputMode="numeric"
                  maxLength={6}
                  className="flex-1 bg-paper-surface rounded-xl border border-paper-line px-3 py-2.5 text-sm text-paper-ink outline-none focus:border-paper-accent"
                  onKeyDown={e => e.key === "Enter" && submit()}
                />
                <button
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                  className="px-3 py-2.5 rounded-xl bg-paper-surface border border-paper-line text-xs text-paper-ink whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:border-paper-accent transition"
                >
                  {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
                </button>
              </div>
              {devCode && (
                <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 border border-amber-200">
                  🛠️ dev 模式：验证码 <b className="font-mono">{devCode}</b>（Worker 未配 Email Sending，不会真发邮件）
                </div>
              )}
            </div>
          )}

          {/* 密码 */}
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
          {success && !error && !devCode && (
            <div className="bg-green-50 text-green-700 text-xs rounded-lg px-3 py-2 border border-green-200">
              {success}
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
