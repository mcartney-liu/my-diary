import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getProfile, patchProfile, submitFeedback, type ProfileStats } from "../api";
import { polishFeedback, getAiProvider } from "../ai";
import TemplateLibrary from "./TemplateLibrary";
import PaperLibrary from "./PaperLibrary";

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
  const [activeTab, setActiveTab] = useState<"profile" | "templates" | "papers">("profile");

  // 反馈弹窗
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [fbType, setFbType] = useState("suggestion");
  const [fbTitle, setFbTitle] = useState("");
  const [fbContent, setFbContent] = useState("");
  const [fontSetting, setFontSetting] = useState(localStorage.getItem("mydiary_font") || "hand");
  const [showFontPicker, setShowFontPicker] = useState(false);
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
      alert("AI 整理失败: " + (e.message || "试试文字输入吧"));
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

        {/* Tab bar: 个人 / 模板库 / 信纸库 */}
        <div className="flex gap-1 p-1 bg-paper-card rounded-card shadow-card border border-paper-line/50">
          {[
            { k: "profile", label: "👤 个人" },
            { k: "templates", label: "📚 模板库" },
            { k: "papers", label: "🎨 信纸库" },
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

        {/* 设置（以后扩展） */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 overflow-hidden">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase px-5 pt-4 pb-2">⚙️ 设置</h3>
          <MenuItem icon="🎨" label="主题色（即将上线）" disabled />
          <MenuItem icon="🔔" label="每日提醒（即将上线）" disabled />
          <MenuItem icon="📤" label="导出数据（即将上线）" disabled />
          <MenuItem icon="🖋️" label="字体样式" hint={fontSetting === "hand" ? "全手写" : fontSetting === "pen" ? "钢笔中文" : "系统默认"} onClick={() => setShowFontPicker(true)} />
          <MenuItem icon="🔐" label="修改密码" onClick={() => alert("功能开发中...")} />
        </section>

        {/* 关于 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 overflow-hidden">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase px-5 pt-4 pb-2">💬 关于</h3>
          <MenuItem icon="ℹ️" label={`版本 v${__APP_VERSION__} · 点击看更新记录`} onClick={() => setShowChangelog(true)} />
          <MenuItem icon="❤️" label="反馈与建议" onClick={() => setShowFeedback(true)} />
        </section>
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
                        {fbPolishing ? "✨ 整理中..." : "✨ AI 整理成 bug 报告"}
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
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-paper-accent">v0.2.0</span>
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

function MenuItem({ icon, label, hint, onClick, disabled }: { icon: string; label: string; hint?: string; onClick?: () => void; disabled?: boolean }) {
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
      {hint && <span className="text-paper-ink3 text-sm">{hint}</span>}
      {!disabled && <span className="text-paper-ink3 text-sm">›</span>}
    </button>
  );
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  return n.toLocaleString();
}
