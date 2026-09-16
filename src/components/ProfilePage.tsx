import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getProfile, patchProfile, type ProfileStats } from "../api";

interface ProfileData {
  user: { id: string; email: string; nickname?: string; avatar?: string };
  profile: { bio?: string; theme?: string; default_mood?: string; daily_goal?: number } | null;
  stats: ProfileStats;
}

export default function ProfilePage() {
  const nav = useNavigate();
  const auth = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then(r => setData(r))
      .catch(e => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    if (!confirm("确定要退出登录吗？")) return;
    auth.logout();
    nav("/", { replace: true });
  };

  const startEditNickname = () => {
    setNicknameInput(data?.user.nickname || "");
    setEditingNickname(true);
  };

  const saveNickname = async () => {
    if (!nicknameInput.trim()) { setEditingNickname(false); return; }
    setSaving(true);
    try {
      await patchProfile({ nickname: nicknameInput.trim() });
      setData(d => d ? { ...d, user: { ...d.user, nickname: nicknameInput.trim() } } : d);
      // 同步更新 AuthContext 里的 user
      auth.refresh();
      setEditingNickname(false);
    } catch (e: any) {
      alert("保存失败: " + (e.message || "未知错误"));
    } finally {
      setSaving(false);
    }
  };

  // 根据昵称生成头像 emoji（简单规则）
  const avatarEmoji = (nick: string) => {
    const emojis = ["🌟", "📚", "☕", "🌿", "🎨", "🎵", "🍀", "🌸", "🐱", "🦊", "🐼", "🌈", "✨", "🍁", "🌙"];
    let hash = 0;
    for (let i = 0; i < nick.length; i++) hash = (hash * 31 + nick.charCodeAt(i)) >>> 0;
    return emojis[hash % emojis.length];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-bg flex items-center justify-center">
        <div className="text-paper-ink2 text-sm">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-paper-bg flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-paper-ink">😢 {error || "加载失败"}</div>
        <button onClick={() => nav(-1)} className="px-4 py-2 rounded-full border border-paper-line bg-paper-surface text-sm">返回</button>
      </div>
    );
  }

  const { user, stats } = data;
  const displayName = user.nickname || user.email.split("@")[0];

  return (
    <div className="min-h-screen bg-paper-bg pb-10">
      {/* 顶部 */}
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-[#faf6ef]/85 border-b border-paper-line/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
          >
            ← 返回
          </button>
          <h1 className="text-paper-ink font-semibold text-lg tracking-wide">我的</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5 animate-fade-up">
        {/* 用户卡片 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5">
          <div className="flex items-center gap-4">
            {/* 头像 */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-paper-surface border-2 border-paper-line/60 flex items-center justify-center text-3xl shadow-soft">
              {user.avatar || avatarEmoji(displayName)}
            </div>

            {/* 昵称 + 邮箱 */}
            <div className="flex-1 min-w-0">
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nicknameInput}
                    onChange={e => setNicknameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") setEditingNickname(false); }}
                    maxLength={20}
                    className="flex-1 px-2 py-1 rounded-md border border-paper-line bg-paper-surface text-paper-ink text-lg font-semibold focus:outline-none focus:border-paper-accent"
                  />
                  <button
                    onClick={saveNickname}
                    disabled={saving}
                    className="px-3 py-1 rounded-full bg-paper-ink text-paper-bg text-xs font-medium disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-paper-ink text-xl font-semibold truncate">{displayName}</h2>
                  <button
                    onClick={startEditNickname}
                    title="编辑昵称"
                    className="text-paper-ink3 hover:text-paper-accent text-sm transition"
                  >
                    ✏️
                  </button>
                </div>
              )}
              <p className="text-paper-ink2 text-sm mt-0.5 truncate">{user.email}</p>
            </div>
          </div>
        </section>

        {/* 统计卡片 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase mb-4">📊 写作统计</h3>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="总篇日记" value={stats.total_diaries.toString()} />
            <StatTile label="连续天数" value={stats.streak_days.toString()} suffix="天" />
            <StatTile label="累计字数" value={formatNumber(stats.total_words)} />
          </div>
        </section>

        {/* 设置（以后扩展） */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 overflow-hidden">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase px-5 pt-4 pb-2">⚙️ 设置</h3>
          <MenuItem icon="🎨" label="主题色（即将上线）" disabled />
          <MenuItem icon="🔔" label="每日提醒（即将上线）" disabled />
          <MenuItem icon="📤" label="导出数据（即将上线）" disabled />
          <MenuItem icon="🔐" label="修改密码" onClick={() => alert("功能开发中...")} />
        </section>

        {/* 关于 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 overflow-hidden">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase px-5 pt-4 pb-2">💬 关于</h3>
          <MenuItem icon="ℹ️" label="版本 v0.1.0" disabled />
          <MenuItem icon="❤️" label="反馈与建议" onClick={() => alert("感谢反馈！")} />
        </section>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-card border border-red-200 bg-red-50 text-red-600 font-medium hover:bg-red-100 transition active:scale-[0.98]"
        >
          退出登录
        </button>

        <p className="text-center text-paper-ink3 text-xs pt-2">
          MyDiary · 纸风格日记 · Powered by Cloudflare
        </p>
      </main>
    </div>
  );
}

function StatTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-paper-ink">
        {value}
        {suffix && <span className="text-sm font-normal text-paper-ink2 ml-0.5">{suffix}</span>}
      </div>
      <div className="text-paper-ink3 text-xs mt-1">{label}</div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled }: { icon: string; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        "w-full flex items-center gap-3 px-5 py-3.5 text-left transition",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-paper-surface active:bg-paper-line/30",
      ].join(" ")}
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-paper-ink">{label}</span>
      {!disabled && <span className="text-paper-ink3 text-sm">›</span>}
    </button>
  );
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  return n.toLocaleString();
}
