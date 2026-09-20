import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getProfile, patchProfile, submitFeedback, type ProfileStats, listMemory, addMemory, deleteMemory } from "../api";
import { polishFeedback, getAiProvider } from "../ai";
import TemplateLibrary from "./TemplateLibrary";
import PaperLibrary from "./PaperLibrary";

interface MemoryItem { id: number; type: string; content: string; confidence: number; status: string; created_at: string; }

declare const __APP_VERSION__: string;

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
  const [activeTab, setActiveTab] = useState<"profile" | "templates" | "papers" | "memory">("profile");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [newMemType, setNewMemType] = useState("fact");
  const [newMemContent, setNewMemContent] = useState("");

  // 反馈弹窗
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [fbType, setFbType] = useState("suggestion");
  const [fbTitle, setFbTitle] = useState("");
  const [fbContent, setFbContent] = useState("");
  const [fontSetting, setFontSetting] = useState(localStorage.getItem("mydiary_font") || "hand");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false); // ⭐ 齿轮弹出菜单
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSent, setFbSent] = useState(false);
  // 语音录入
  const [fbRecording, setFbRecording] = useState(false);
  const fbSpeechRef = useRef<any>(null);
  const fbSpeechSupported = typeof (window as any).SpeechRecognition !== "undefined" || typeof (window as any).webkitSpeechRecognition !== "undefined";
  // AI 美化
  const [fbPolishing, setFbPolishing] = useState(false);

  useEffect(() => {
    getProfile()
      .then(r => setData(r))
      .catch(e => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  // ===== 字体切换：fontSetting 变化 → localStorage + html/body[data-font] =====
  // ⚠️ 必须同时设 html 和 body — Tailwind preflight 会给 html 注入 PingFang SC
  useEffect(() => {
    localStorage.setItem("mydiary_font", fontSetting);
    document.documentElement.setAttribute("data-font", fontSetting);
    document.body.setAttribute("data-font", fontSetting);
  }, [fontSetting]);

  // ===== 切换到记忆 tab 时加载 =====
  useEffect(() => {
    if (activeTab !== "memory") return;
    setMemoryLoading(true);
    listMemory()
      .then(r => setMemories(r.memories || []))
      .catch(() => setMemories([]))
      .finally(() => setMemoryLoading(false));
  }, [activeTab]);

  const handleAddMemory = async () => {
    if (!newMemContent.trim()) return;
    try {
      await addMemory(newMemType, newMemContent.trim(), 0.8);
      setNewMemContent("");
      const r = await listMemory();
      setMemories(r.memories || []);
    } catch {}
  };

  const handleDeleteMemory = async (id: number) => {
    if (!confirm("删除这条记忆？AI 下次就不会用上了")) return;
    try {
      await deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  const handleLogout = () => {
    if (!confirm("确定要退出登录吗？")) return;
    auth.logout();
    nav("/", { replace: true });
  };

  const startEditNickname = () => {
    setNicknameInput(data?.user.nickname || "");
    setEditingNickname(true);
  };

  const submitFeedbackNow = async () => {
    if (!fbContent.trim()) return;
    setFbSubmitting(true);
    try {
      await submitFeedback({ type: fbType, title: fbTitle, content: fbContent });
      setFbSent(true);
      setTimeout(() => {
        setShowFeedback(false);
        setFbSent(false);
        setFbTitle("");
        setFbContent("");
        setFbType("suggestion");
      }, 1500);
    } catch (e: any) {
      alert("提交失败: " + (e.message || "网络错误，请稍后再试"));
    } finally {
      setFbSubmitting(false);
    }
  };

  // ===== 反馈语音录入 =====
  const startFbRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("当前浏览器不支持语音识别"); return; }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setFbContent((prev) => {
        const base = prev.replace(/\s*(临时:.*)?$/, "");
        return finalText + interim ? finalText + interim : base;
      });
    };
    rec.onerror = (e: any) => {
      console.warn("反馈语音识别错误:", e.error);
      setFbRecording(false);
    };
    rec.onend = () => {
      setFbRecording(false);
    };
    fbSpeechRef.current = rec;
    rec.start();
    setFbRecording(true);
  };
  const stopFbRecording = () => {
    try { fbSpeechRef.current?.stop(); } catch {}
    setFbRecording(false);
  };

  // ===== 反馈 AI 美化（开发视角 bug report）=====
  const runFbPolish = async () => {
    if (!fbContent.trim()) { alert("先写点东西再整理吧"); return; }
    setFbPolishing(true);
    try {
      const polished = await polishFeedback(fbContent, fbType, getAiProvider());
      setFbContent(polished);
      // 自动提取标题：格式是 "标题：xxx" 或 "标题: xxx"
      const titleMatch = polished.match(/^标题[:：]\s*(.+)$/m);
      if (titleMatch) setFbTitle(titleMatch[1].trim());
    } catch (e: any) {
      alert("整理失败: " + (e.message || "试试文字输入吧"));
    } finally {
      setFbPolishing(false);
    }
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
          <h1 className="text-paper-ink font-semibold text-lg tracking-wide flex-1">我的</h1>
          {/* ⭐ 右上角齿轮按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(v => !v)}
              title="设置"
              className={`px-2.5 py-1.5 rounded-full border text-sm transition active:scale-95 ${
                showSettings
                  ? "border-paper-accent bg-paper-accent/10 text-paper-ink"
                  : "border-paper-line bg-paper-surface hover:bg-paper-line/50 text-paper-ink"
              }`}
            >
              ⚙️
            </button>

            {/* ⭐ 设置弹出菜单 */}
            {showSettings && (
              <>
                {/* 背景遮罩（点击关闭） */}
                <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />
                {/* 菜单面板 */}
                <div className="absolute right-0 top-full mt-2 w-64 bg-paper-card rounded-card shadow-card border border-paper-line/80 overflow-hidden z-40 animate-fade-up">
                  {/* 设置区 */}
                  <div className="px-4 pt-3 pb-1 text-[10px] font-medium tracking-wider uppercase text-paper-ink3">⚙️ 设置</div>
                  <button
                    onClick={() => { setShowSettings(false); setShowFontPicker(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink hover:bg-paper-surface transition"
                  >
                    <span>🖋️</span>
                    <span className="flex-1 text-left">字体样式</span>
                    <span className="text-xs text-paper-ink2">
                      {fontSetting === "hand" ? "全手写" : fontSetting === "pen" ? "钢笔中文" : "系统默认"}
                    </span>
                    <span className="text-paper-ink3">›</span>
                  </button>
                  <button disabled className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink3 cursor-not-allowed">
                    <span>🎨</span>
                    <span className="flex-1 text-left">主题色</span>
                    <span className="text-[10px]">即将上线</span>
                  </button>
                  <button disabled className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink3 cursor-not-allowed">
                    <span>🔔</span>
                    <span className="flex-1 text-left">每日提醒</span>
                    <span className="text-[10px]">即将上线</span>
                  </button>
                  <button disabled className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink3 cursor-not-allowed">
                    <span>📤</span>
                    <span className="flex-1 text-left">导出数据</span>
                    <span className="text-[10px]">即将上线</span>
                  </button>
                  <button
                    onClick={() => { setShowSettings(false); alert("功能开发中..."); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink hover:bg-paper-surface transition"
                  >
                    <span>🔐</span>
                    <span className="flex-1 text-left">修改密码</span>
                    <span className="text-paper-ink3">›</span>
                  </button>

                  {/* 分隔线 */}
                  <div className="border-t border-paper-line/60 my-1" />

                  {/* 关于区 */}
                  <div className="px-4 pt-2 pb-1 text-[10px] font-medium tracking-wider uppercase text-paper-ink3">💬 关于</div>
                  <button
                    onClick={() => { setShowSettings(false); setShowChangelog(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink hover:bg-paper-surface transition"
                  >
                    <span>ℹ️</span>
                    <span className="flex-1 text-left">版本 v{__APP_VERSION__}</span>
                    <span className="text-xs text-paper-accent">更新记录</span>
                  </button>
                  <button
                    onClick={() => { setShowSettings(false); setShowFeedback(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-paper-ink hover:bg-paper-surface transition"
                  >
                    <span>❤️</span>
                    <span className="flex-1 text-left">反馈与建议</span>
                    <span className="text-paper-ink3">›</span>
                  </button>
                </div>
              </>
            )}
          </div>
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

        {/* Tab bar: 个人 / 模板库 / 信纸库 */}
        <div className="flex gap-1 p-1 bg-paper-card rounded-card shadow-card border border-paper-line/50">
          {[
            { k: "profile", label: "👤 个人" },
            { k: "templates", label: "📚 模板库" },
            { k: "papers", label: "🎨 信纸库" },
            { k: "memory", label: "🧠 记忆" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setActiveTab(t.k as any)}
              className={`flex-1 py-2 rounded-md text-sm transition ${
                activeTab === t.k ? "bg-white shadow-sm text-paper-ink font-medium" : "text-paper-ink2"
              }`}
            >{t.label}</button>
          ))}
        </div>

        {activeTab === "profile" && (
        <>
        {/* 统计卡片 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase mb-4">📊 写作统计</h3>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="总篇日记" value={stats.total_diaries.toString()} />
            <StatTile label="连续天数" value={stats.streak_days.toString()} suffix="天" />
            <StatTile label="累计字数" value={formatNumber(stats.total_words)} />
          </div>
        </section>
        {/* ⭐ 设置和关于已移到右上角齿轮按钮 */}
        </>)}

        {activeTab === "templates" && (
          <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5">
            <TemplateLibrary />
          </section>
        )}

        {activeTab === "papers" && (
          <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5">
            <PaperLibrary />
          </section>
        )}

        {activeTab === "memory" && (
          <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5 space-y-4">
            {/* 标题 */}
            <div>
              <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">🧠 我的记忆</h3>
              <p className="text-paper-ink3 text-xs mt-1">AI 会记住这些，下次自动用上</p>
            </div>

            {/* 手动加一条 */}
            <div className="border border-paper-line/60 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <select
                  value={newMemType}
                  onChange={e => setNewMemType(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-paper-line bg-white text-xs text-paper-ink focus:outline-none focus:border-paper-ink/40"
                >
                  <option value="preference">偏好 💫</option>
                  <option value="profile">个人 📋</option>
                  <option value="fact">事实 📌</option>
                  <option value="task">待办 ✅</option>
                  <option value="interest">兴趣 🎨</option>
                </select>
                <input
                  value={newMemContent}
                  onChange={e => setNewMemContent(e.target.value)}
                  placeholder="记住一件事，比如：我讨厌加班"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-paper-line bg-white text-sm text-paper-ink focus:outline-none focus:border-paper-ink/40"
                  onKeyDown={e => { if (e.key === "Enter") handleAddMemory(); }}
                />
                <button
                  onClick={handleAddMemory}
                  disabled={!newMemContent.trim()}
                  className="px-3 py-1.5 rounded-lg bg-paper-ink text-paper-bg text-sm disabled:opacity-40"
                >添加</button>
              </div>
            </div>

            {/* 记忆列表 */}
            {memoryLoading ? (
              <div className="text-center text-paper-ink3 text-sm py-6">加载中…</div>
            ) : memories.length === 0 ? (
              <div className="text-center text-paper-ink3 text-sm py-8 border border-dashed border-paper-line/60 rounded-xl">
                还没有记忆 🌱 和 AI 聊几次天，它会自动记住重要的事
              </div>
            ) : (
              <div className="space-y-2">
                {memories.map(m => (
                  <div key={m.id} className="border border-paper-line/60 rounded-xl p-3 hover:border-paper-ink/30 transition group">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
                        m.type === "preference" ? "bg-amber-100 text-amber-700" :
                        m.type === "profile"    ? "bg-blue-100 text-blue-700" :
                        m.type === "task"       ? "bg-green-100 text-green-700" :
                        m.type === "interest"   ? "bg-pink-100 text-pink-700" :
                                                  "bg-gray-100 text-gray-700"
                      }`}>
                        {m.type === "preference" ? "偏好" : m.type === "profile" ? "个人" : m.type === "task" ? "待办" : m.type === "interest" ? "兴趣" : "事实"}
                      </span>
                      <span className="flex-1 text-sm text-paper-ink leading-relaxed">{m.content}</span>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="text-paper-ink3 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition"
                        title="删除这条记忆"
                      >删除</button>
                    </div>
                    <div className="mt-1.5 text-[10px] text-paper-ink3">
                      置信度 {Math.round(m.confidence * 100)}% · {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 退出登录（始终显示） */}
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

      {/* 📮 反馈弹窗 */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !fbSubmitting && setShowFeedback(false)}>
          <div
            className="bg-paper-bg rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-paper-line animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {fbSent ? (
              <div className="p-8 text-center">
                <div className="text-5xl mb-3">🎉</div>
                <div className="text-paper-ink font-semibold text-lg">提交成功！</div>
                <div className="text-paper-ink2 text-sm mt-1">感谢你的反馈，我会认真看的～</div>
              </div>
            ) : (
              <>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-paper-line">
                  <h3 className="text-paper-ink font-semibold text-lg">💬 反馈与建议</h3>
                  <button
                    onClick={() => !fbSubmitting && setShowFeedback(false)}
                    disabled={fbSubmitting}
                    className="text-paper-ink3 hover:text-paper-ink text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-paper-surface transition disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* 类型选择 */}
                  <div>
                    <label className="text-paper-ink2 text-xs font-medium">类型</label>
                    <div className="flex gap-2 mt-1.5">
                      {[
                        { v: "suggestion", label: "💡 建议" },
                        { v: "bug",        label: "🐛 Bug" },
                        { v: "other",      label: "📝 其他" },
                      ].map(o => (
                        <button
                          key={o.v}
                          onClick={() => setFbType(o.v)}
                          className={[
                            "px-3 py-1.5 rounded-full text-sm border transition",
                            fbType === o.v
                              ? "bg-paper-ink text-paper-bg border-paper-ink"
                              : "bg-paper-surface text-paper-ink2 border-paper-line hover:border-paper-ink3",
                          ].join(" ")}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 标题（可选） */}
                  <div>
                    <label className="text-paper-ink2 text-xs font-medium">标题（可选）</label>
                    <input
                      value={fbTitle}
                      onChange={e => setFbTitle(e.target.value)}
                      maxLength={50}
                      placeholder="简短描述一下..."
                      className="w-full mt-1.5 px-3 py-2 rounded-lg border border-paper-line bg-paper-surface text-paper-ink focus:outline-none focus:border-paper-accent"
                    />
                  </div>

                  {/* 内容 */}
                  <div>
                    <label className="text-paper-ink2 text-xs font-medium">详细描述</label>
                    <textarea
                      value={fbContent}
                      onChange={e => setFbContent(e.target.value)}
                      maxLength={2000}
                      rows={5}
                      placeholder="遇到了什么问题？或者有什么好想法？"
                      className="w-full mt-1.5 px-3 py-2 rounded-lg border border-paper-line bg-paper-surface text-paper-ink focus:outline-none focus:border-paper-accent resize-none"
                    />
                    <div className="text-right text-paper-ink3 text-xs mt-1">{fbContent.length}/2000</div>
                    {/* 语音录入 + AI 整理 */}
                    <div className="flex gap-2 mt-2">
                      {fbSpeechSupported ? (
                        <button
                          onClick={fbRecording ? stopFbRecording : startFbRecording}
                          disabled={fbPolishing}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                            fbRecording
                              ? "bg-red-500 text-white border-red-500 animate-pulse"
                              : "bg-paper-surface text-paper-ink2 border-paper-line hover:border-paper-accent"
                          } disabled:opacity-40`}
                        >
                          {fbRecording ? "⏹️ 停止录音" : "🎙️ 语音录入"}
                        </button>
                      ) : null}
                      <button
                        onClick={runFbPolish}
                        disabled={!fbContent.trim() || fbPolishing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-paper-line bg-paper-surface text-paper-ink2 hover:border-paper-accent transition disabled:opacity-40"
                      >
                        {fbPolishing ? "✨ 整理中..." : "✨ 整理成反馈报告"}
                      </button>
                    </div>
                  </div>

                  {/* 提交按钮 */}
                  <button
                    onClick={submitFeedbackNow}
                    disabled={!fbContent.trim() || fbSubmitting}
                    className="w-full py-3 rounded-card bg-paper-ink text-paper-bg font-medium hover:bg-paper-ink/90 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {fbSubmitting ? "提交中..." : "提交反馈"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📋 版本更新记录弹窗 */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowChangelog(false)}>
          <div
            className="bg-paper-bg rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-paper-line animate-slide-up max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-paper-line shrink-0">
              <h3 className="text-paper-ink font-semibold text-lg">📋 更新记录</h3>
              <button
                onClick={() => setShowChangelog(false)}
                className="text-paper-ink3 hover:text-paper-ink text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-paper-surface transition"
              >×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-sm text-paper-ink space-y-4">
              {/* === v0.4.2 当前版本（高亮） === */}
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-accent">v{__APP_VERSION__}</span>
                  <span className="text-paper-ink3 text-xs">2026年09月20日</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-paper-accent/10 text-paper-accent rounded">最新</span>
                </div>
                <div className="space-y-2 text-paper-ink2 leading-relaxed">
                  <div><b className="text-paper-ink">🎉 新功能</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>💬 <b>小麦 — 你的 AI 助手</b> — 首页顶栏 Tab「💬 小麦」正式命名，多会话管理 / 历史抽屉 / 自动保存全部保留</li>
                    <li>🧠 <b>小麦会记住你了 — 长期记忆系统</b> — 聊天时提到自己的事会自动提取成记忆存下来，下次聊到相关的自动用上；我的页面新增「🧠 记忆」tab：手动加、看全部、删除；五种记忆类型：💫 偏好 / 📋 个人 / 📌 事实 / ✅ 待办 / 🎨 兴趣</li>
                    <li>🔍 <b>回答更准了 — 检索三层升级</b> — 向量相似度（0.7）+ 关键词匹配（0.3）加权融合，再加 bge-reranker-base 精排（初筛 top12 → 专家精选 top5）；常识问题自动跳过日记检索</li>
                  </ul>
                  <div><b className="text-paper-ink">🐛 修复</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Agnes LLM 偶尔返回乱码 — BOM 头没剥干净</li>
                    <li>关键词路由不准 — "我想加班"里的"我想"被误判成日记关键词</li>
                    <li>边界情况请求直接炸 — handleAsk try-catch 没闭合</li>
                  </ul>
                </div>
              </div>

              {/* === v0.4.0 === */}
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-accent">v{__APP_VERSION__}</span>
                  <span className="text-paper-ink3 text-xs">2026年09月19日</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-paper-accent/10 text-paper-accent rounded">最新</span>
                </div>
                <div className="space-y-2 text-paper-ink2 leading-relaxed">
                  <div><b className="text-paper-ink">🎉 新功能</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>💬 <b>日记知识库</b> — 首页顶部 Tab 新增「💬 知识库」入口，和月历 / 年度回顾并列；能从所有日记里按语义找片段回答问题，附带引用来源</li>
                    <li>🧠 <b>多会话管理</b> — 点左上角 ☰ 打开历史抽屉，「＋ 新对话」新建空白，点历史项切换回去，鼠标悬停可删除单个会话</li>
                    <li>💾 <b>聊天记录自动保存</b> — 所有对话持久化到本地，刷新页面、重新登录都不丢；当前活跃哪个会话也记住</li>
                    <li>😊 <b>问候不再死板</b> — "你好"、"你是谁" 不再说"没找到相关内容"，会友好介绍自己能帮什么</li>
                  </ul>
                  <div><b className="text-paper-ink">🧭 交互调整</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>顶栏导航变成三 Tab（📅 月历 / 📊 年度回顾 / 💬 知识库），AI 入口从底部导航移除，保持底部三项不变</li>
                    <li>知识库内嵌在 Tab 切换区，不再是右侧抽屉，和月历 / 年度回顾同级同宽</li>
                    <li>全局不用 "AI" 字样，统一叫「知识库」、图标 💬</li>
                  </ul>
                </div>
              </div>

              {/* === v0.3.1 === */}
              <div className="border-t border-paper-line pt-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-ink">v0.3.0</span>
                  <span className="text-paper-ink3 text-xs">2026年09月17日</span>
                </div>
                <div className="space-y-2 text-paper-ink2 leading-relaxed">
                  <div><b className="text-paper-ink">🎉 新功能</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>🎯 <b>计划模块（原每日计划升级）</b> — 从「每日计划」模板扩展成完整的计划系统，任何未来日期的计划都能写成日记并自动倒计时；顶部导航栏 🎯 入口 + PlanPage/PlanLibrary 组件</li>
                    <li>📖 <b>每日一句话入库 + 历史查看</b> — 每天自动提炼的一句话会存起来，点「📖 历史」弹出抽屉按日期倒序查看；空状态四种温暖文案覆盖全部场景</li>
                    <li>📅 <b>纪念日独立页面</b> — 从 Profile「我的」移除，统一归首页顶部导航 🎈 入口</li>
                    <li>⚙️ <b>设置移到右上角</b> — 齿轮按钮弹出菜单（字体切换 / 智能服务 / 反馈 / 关于），更符合移动端常规操作</li>
                    <li>🎤 <b>语音识别断线自动重连</b> — Chrome 原生语音识别会随机断开（网络抖动、切后台），现在自动重启 + 防抖 timer，识别稳定性显著提升</li>
                  </ul>
                  <div><b className="text-paper-ink">🐛 修复</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>每日一句话永远走兜底 — callChatCompletion 写死 json_object 强制返回 JSON → 每次命中错误兜底。加 responseFormat 参数，summarizeDay 用纯文本</li>
                    <li>总结缓存 key bump v2，清掉之前坏掉的兜底缓存</li>
                  </ul>
                  <div><b className="text-paper-ink">🧹 交互改进</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>4 个列表页（标签/纪念日/计划/时间胶囊）空状态统一：顶部常驻说明文字、空状态 py-12 居中布局</li>
                    <li>顶部导航栏 🏷️ 🎈 🎯 🫧 🗑️ 一键直达，不再 toggle 选中</li>
                  </ul>
                </div>
              </div>

              {/* === v0.2.1 === */}
              <div className="border-t border-paper-line pt-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-ink">v0.2.1</span>
                  <span className="text-paper-ink3 text-xs">2026年09月16日</span>
                </div>
                <div className="space-y-2 text-paper-ink2 leading-relaxed">
                  <div><b className="text-paper-ink">🎉 新功能</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>💾 <b>日记 Block 软删除</b> — 删除后划掉 + 恢复按钮，确认后才真正删除</li>
                    <li>✍️ <b>继续书写</b> — 编辑器底部直接写，不用点按钮新建 block</li>
                    <li>📚 <b>模板/信纸共享系统</b> — 共享给所有人、带作者信息</li>
                    <li>🖋️ <b>字体自定义</b> — 我的→设置→字体样式，三种可选
                      <span className="text-paper-ink3 text-xs ml-1">（全手写推荐 / 钢笔中文 / 系统默认）</span>
                    </li>
                    <li>🧪 <b>Dev Pages 测试环境</b> — mydiary-web-dev.pages.dev，永久不变</li>
                  </ul>
                  <div><b className="text-paper-ink">🐛 修复</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>删除后恢复功能 — 修了很久的核心交互</li>
                    <li>iOS Safari 中文不手写 — font-display:swap + 大字体不自动重绘</li>
                    <li>Tailwind preflight 覆盖手写字体 — html+body 双重保险</li>
                    <li>字体栈顺序：Kalam 放第一位覆盖英文数字</li>
                  </ul>
                </div>
              </div>

              {/* === v0.2.0 === 恢复原始完整内容 === */}
              <div className="border-t border-paper-line pt-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-ink">v0.2.0</span>
                  <span className="text-paper-ink3 text-xs">2026年09月16日</span>
                </div>
                <div className="space-y-2 text-paper-ink2 leading-relaxed">
                  <div><b className="text-paper-ink">🎉 新功能</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>📚 模板共享 — 创建 / 编辑 / 共享自定义模板</li>
                    <li>🎨 信纸共享 — 上传信纸 / 一键共享</li>
                    <li>👤 全新「我的」页面 — 3 个 Tab</li>
                    <li>💬 反馈与建议 — 直接提交到 D1</li>
                  </ul>
                  <div><b className="text-paper-ink">🔧 改进</b></div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>模板切换有内容时弹确认框</li>
                    <li>选中色统一紫色 (violet)</li>
                    <li>Drawer 精简，编辑/删除统一去「我的」</li>
                  </ul>
                </div>
              </div>

              {/* === v0.1.0 === 恢复原始完整内容 === */}
              <div className="border-t border-paper-line pt-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-ink3">v0.1.0</span>
                  <span className="text-paper-ink3 text-xs">2026年09月10日</span>
                </div>
                <div className="space-y-1 text-paper-ink3 leading-relaxed text-xs">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>邮箱注册/登录 + JWT 鉴权</li>
                    <li>日记 CRUD + 云端同步</li>
                    <li>10 种 Block 组件</li>
                    <li>8 个官方模板</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🖋️ 字体选择器 */}
      {showFontPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowFontPicker(false)}>
          <div
            className="bg-paper-bg rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-paper-line animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-paper-line">
              <h3 className="text-paper-ink font-semibold text-lg">🖋️ 选择字体</h3>
              <button
                onClick={() => setShowFontPicker(false)}
                className="text-paper-ink3 hover:text-paper-ink text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-paper-surface transition"
              >×</button>
            </div>

            <div className="p-5 space-y-3">
              {[
                { key: "hand", label: "全手写（推荐）", desc: "中文钢笔 + 英文手写", sample: "MyDiary 2026 ✨ 今天天气不错～" },
                { key: "pen",  label: "钢笔中文",       desc: "中文手写，英文印刷", sample: "MyDiary 2026 ✨ 今天天气不错～" },
                { key: "sans", label: "系统默认",       desc: "简洁印刷体",       sample: "MyDiary 2026 ✨ 今天天气不错～" },
              ].map(o => {
                const active = fontSetting === o.key;
                const fontFamily =
                  o.key === "hand" ? `"Kalam", "Ma Shan Zheng", "楷体", "KaiTi", system-ui, sans-serif` :
                  o.key === "pen"  ? `"Ma Shan Zheng", "Kalam", "楷体", "KaiTi", system-ui, sans-serif` :
                                     `"PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
                return (
                  <button
                    key={o.key}
                    onClick={() => { setFontSetting(o.key); setShowFontPicker(false); }}
                    className={[
                      "w-full text-left p-4 rounded-xl border-2 transition flex items-center gap-4",
                      active
                        ? "border-paper-accent bg-paper-surface"
                        : "border-paper-line bg-paper-card hover:border-paper-ink3",
                    ].join(" ")}
                  >
                    {/* 预览文字（用对应字体渲染） */}
                    <div
                      className="text-[22px] text-paper-ink leading-snug min-w-0 flex-1 truncate"
                      style={{ fontFamily }}
                    >{o.sample}</div>
                    {/* 右侧：标签 + 对勾 */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={[
                        "text-sm font-medium",
                        active ? "text-paper-accent" : "text-paper-ink2",
                      ].join(" ")}>{o.label}</span>
                      <span className="text-paper-ink3 text-xs">{o.desc}</span>
                    </div>
                    {active && (
                      <span className="text-paper-accent text-xl shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  return n.toLocaleString();
}

// rebuild trigger 07:41:03


