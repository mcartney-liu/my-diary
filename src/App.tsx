import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import type { Diary, MoodId, DiaryBlock } from "./types";
import { seedIfEmpty } from "./storage";
import { upsertDiary as apiUpsert, deleteDiary as apiDelete, listDiaries as apiListDiaries, getToken } from "./api";
import { useAuth } from "./AuthContext";
// ⭐ 平台能力（App/Web 差异统一入口，见 docs/APP-SYNC-RULES.md）
import { platform } from "./platform";
import LoginPage from "./components/LoginPage";
import CalendarPage from "./components/CalendarPage";
import EditorPage from "./components/EditorPage";
import TrashPage from "./components/TrashPage";
import TagsPage from "./components/TagsPage";
import CapsulePage from "./components/CapsulePage";
import MilestonesPage from "./components/MilestonesPage";
import PlanPage from "./components/PlanPage";
import FinancePage from "./components/FinancePage";
import ProfilePage from "./components/ProfilePage";
import BookShelfPage from "./components/BookShelfPage";
import DiaryListPage from "./components/DiaryListPage";
import SourcesPanel from "./components/SourcesPanel";

// 后台写入 localStorage（不阻塞主线程）
let saveQueue = Promise.resolve();
function saveLocalAsync(list: Diary[]) {
  saveQueue = saveQueue.then(() => new Promise<void>((resolve) => {
    // 用 requestIdleCallback / setTimeout 把 JSON.stringify + setItem 丢到空闲期
    const run = () => {
      try {
        const raw = JSON.stringify(list);
        localStorage.setItem("mydiary-web:diaries:v1", raw);
      } catch (err) {
        // QuotaExceededError 或其它存储失败 → 只 warn，不 crash
        console.warn("[mydiary] localStorage 写入失败:", err);
      }
      resolve();
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 0);
    }
  }));
}

function saveLocal(list: Diary[]) {
  saveLocalAsync(list);
}

function upsertLocal(list: Diary[], d: Diary): Diary[] {
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0) {
    const next = [...list];
    next[i] = d;
    return next;
  }
  return [...list, d];
}

// 历史 bug 修复：之前每次保存生成新 uid 导致同一篇日记被复制多份
// 两层去重：
// 1. 先按 id 去重（同 id 多份 → 留最新 updatedAt）
// 2. 再按 "date + templateId + title" 去重（同内容不同 id → 留最新）
//    只对 finance/milestone/plan 模板启用（这些模板一天可多篇，但同标题=同内容）
//    diary / travel / gratitude / reading 等普通模板 → 一天多篇是正常的，不做语义去重
function dedupeDiaries(list: Diary[]): Diary[] {
  // 第一层：按 id 去重
  const byId = new Map<string, Diary>();
  for (const d of list) {
    const existing = byId.get(d.id);
    if (!existing || d.updatedAt > existing.updatedAt) byId.set(d.id, d);
  }

  // 第二层：按语义键去重（仅 finance/milestone/plan）
  // diary / travel / gratitude / reading 等 → 一天多篇是正常的，只过第一层 id 去重就够了
  const financeLikeTemplates = new Set(["finance", "milestone", "plan"]);
  const finalList = Array.from(byId.values());
  const seenKey = new Map<string, Diary>();
  const result: Diary[] = [];
  for (const d of finalList) {
    const tpl = d.templateId || "diary";
    // 普通模板直接全保留，不做语义去重
    if (!financeLikeTemplates.has(tpl)) {
      result.push(d);
      continue;
    }
    // finance/milestone/plan：同日期+同模板+同标题 → 留最新
    const key = `${d.date}:${tpl}:${(d.title || "").trim()}`;
    const existing = seenKey.get(key);
    if (!existing || d.updatedAt > existing.updatedAt) {
      seenKey.set(key, d);
    }
  }
  result.push(...seenKey.values());

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ====== 离线重试队列 ======
const PENDING_SYNC_KEY = "mydiary-web:pending-sync:v1";

function loadPendingSync(): Diary[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePendingSync(list: Diary[]) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list));
  } catch { /* quota exceeded */ }
}

function addToPendingSync(d: Diary) {
  const list = loadPendingSync();
  const i = list.findIndex(x => x.id === d.id);
  if (i >= 0) list[i] = d;
  else list.push(d);
  savePendingSync(list);
}

function removeFromPendingSync(id: string) {
  const list = loadPendingSync().filter(x => x.id !== id);
  savePendingSync(list);
}

/** 重推所有待同步日记到云端 */
async function retryPendingSync() {
  const pending = loadPendingSync();
  if (pending.length === 0) return;
  console.info("[mydiary] ☁️ 重推离线日记:", pending.length, "条");
  for (const d of pending) {
    try {
      await apiUpsert(d);
      removeFromPendingSync(d.id);
      console.info("[mydiary] ✅ 重推成功:", d.title || d.date);
    } catch (err) {
      console.warn("[mydiary] ⏸️ 重推失败，稍后再试:", err);
    }
  }
}

export default function App() {
  const auth = useAuth();
  const [allDiaries, setAllDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const [demoBannerClosed, setDemoBannerClosed] = useState(() => {
    try { return localStorage.getItem("mydiary:demoBannerClosed") === "1"; } catch { return false; }
  });
  const [showDemoWelcome, setShowDemoWelcome] = useState(() => {
    // demo 账号每次登录都弹（数据每天重置），用 sessionStorage 避免刷新反复弹
    try { return sessionStorage.getItem("mydiary:demoWelcomeSeen") !== "1"; } catch { return true; }
  });
  const skipBackgroundSyncRef = useRef(false);

  // 删除撤销 Snackbar
  const pendingDeleteRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [undoSnack, setUndoSnack] = useState<{ id: string; title: string } | null>(null);

  // 关闭演示横幅（持久化）
  const closeDemoBanner = () => {
    setDemoBannerClosed(true);
    try { localStorage.setItem("mydiary:demoBannerClosed", "1"); } catch {}
  };

  const closeDemoWelcome = () => {
    setShowDemoWelcome(false);
    try { sessionStorage.setItem("mydiary:demoWelcomeSeen", "1"); } catch {}
  };

  // 全局主题初始化（刷新后不丢失）
  useEffect(() => {
    const saved = localStorage.getItem("mydiary_theme") || "paper";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  // 过滤：正常日记（未软删）和回收站（已软删）
  const diaries = allDiaries.filter((d) => !d.deletedAt);
  const deletedDiaries = allDiaries.filter((d) => !!d.deletedAt);

  useEffect(() => {
    async function init() {
      seedIfEmpty();

      const raw = localStorage.getItem("mydiary-web:diaries:v1");
      let cleaned: Diary[] = [];
      if (raw) {
        try {
          const parsed: Diary[] = JSON.parse(raw);
          cleaned = dedupeDiaries(parsed);
          if (cleaned.length !== parsed.length) { saveLocal(cleaned); }
          setAllDiaries(cleaned);
        } catch { /* ignore */ }
      }
      // ⚠️ setLoading(false) 已下移到云端拉取完成之后（2026-10-06）
      // 原来在拉取之前就关掉 loading → 登录后先渲染空列表，等请求回来才填上，
      // 用户看到几百毫秒的空白窗口期，以为日记丢了。

      // 云端拉取（已登录状态下，优先用云端数据）
      if (getToken()) {
        setLoading(true);   // 覆盖整个拉取过程，避免登录后闪空列表
        apiListDiaries({ limit: 365 })
          .then(r => {
            if (r.diaries?.length) {
              const mapped: Diary[] = r.diaries.map((d: any) => ({
                id: d.id,
                date: d.date,
                templateId: d.template_id || "diary",
                title: d.title || "",
                moodId: d.mood_id || "calm",
                tags: Array.isArray(d.tags) ? d.tags : [],
                // 🔥 天气字段兼容三种格式：JSON 字符串 / 纯文本 / 对象
                weather: (() => {
                  if (!d.weather) return null;
                  if (typeof d.weather === "object") return d.weather;
                  try { return JSON.parse(d.weather); } catch { return null; }
                })(),
                blocks: Array.isArray(d.blocks) ? d.blocks : [],
                createdAt: d.created_at,
                updatedAt: d.updated_at,
                deletedAt: d.deleted_at ?? undefined,
                capsuleUnlockAt: d.capsule_unlock_at ?? undefined,
                wallpaper: d.wallpaper ?? undefined,
                showLines: d.show_lines ?? 1,
              }));
              const merged = dedupeDiaries([...cleaned, ...mapped]);
               // 🔥 不再过滤"本地独有"——离线写的日记还没同步上去，不能当脏数据丢
               setAllDiaries(merged);
               saveLocal(merged);
               // 🔥 初始化完成后，自动重推离线期间积压的日记
               retryPendingSync();
            } else {
              // 🔥 补了 else：云端返回空数组也要 set（之前跳过了 → 新设备 localStorage 空 → 主页永远空）
              setAllDiaries(dedupeDiaries(cleaned));
            }
          })
          // 🔧 原来这里完全静默吞错 → App 里日记列表一片空白却不知原因。
          // 现在至少把原因打到 console，用户侧也能看到提示条。
          .catch((err: any) => {
            console.warn("[mydiary] 云端拉取失败，保留本地数据：", err?.message || err);
            setOfflineBanner(true);
          })
          .finally(() => setLoading(false));   // ← 无论成败都结束 loading
      } else {
        setLoading(false);   // 未登录（首次启动），本地展示即可
      }
    }
    init();
    // 🔧 时序修复（2026-10-06）
    // 原依赖是 []，init 只在首次挂载跑一次；而 init 内的 `if (getToken())`
    // 在「启动后才登录」的新装场景下必然为假 → 云端永远拉不下来，
    // 表现为：Web 写的日记 App 看不到、App 写的 Web 能看到（上传不依赖 init）、
    // 重启 App 就好了。知识库两边都在，因为它是进页面实时请求、不走 init。
    // 改为依赖 auth.loggedIn：登录成功后补跑一次拉取。
  }, [auth.loggedIn, auth.user?.id]);

  // 切回前台自动刷新由下方 `refreshFromCloud()` + visibilitychange/focus 监听负责
  // （Web 端同事已实现通用版，比之前这里另写的一套更完整，避免两套重复发请求）

  useEffect(() => {
    if (!offlineBanner) return;
    const t = window.setTimeout(() => setOfflineBanner(false), 5000);
    return () => window.clearTimeout(t);
  }, [offlineBanner]);

// 多端同步：回到前台 / App 获得焦点时，从云端拉一次最新日记
  // 解决 "Web 端删了 Android 端还留着" 这种跨端延迟问题
  const refreshFromCloud = async () => {
    if (!getToken()) return;
    try {
      const r = await apiListDiaries({ limit: 365 });
      const mapped: Diary[] = (r.diaries || []).map((d: any) => ({
        id: d.id,
        date: d.date,
        templateId: d.template_id || "diary",
        title: d.title || "",
        moodId: d.mood_id || "calm",
        tags: Array.isArray(d.tags) ? d.tags : [],
        weather: (() => {
          if (!d.weather) return null;
          if (typeof d.weather === "object") return d.weather;
          try { return JSON.parse(d.weather); } catch { return null; }
        })(),
        blocks: Array.isArray(d.blocks) ? d.blocks : [],
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        deletedAt: d.deleted_at ?? undefined,
        capsuleUnlockAt: d.capsule_unlock_at ?? undefined,
        wallpaper: d.wallpaper ?? undefined,
        showLines: d.show_lines ?? 1,
      }));
      setAllDiaries(mapped);
      saveLocal(mapped);
    } catch (e: any) {
      console.warn("[mydiary] 🔄 云端刷新失败:", e?.message);
    }
  };

  useEffect(() => {
    // 切回前台自动刷新云端 → 统一走 platform.onAppResume（含 visibilitychange + focus）
    // ⚠️ 平台差异必须收口到 platform.ts（见 docs/APP-SYNC-RULES.md）
    return platform.onAppResume(refreshFromCloud);
  }, []);

  // 🔥 网络恢复 → 自动重推离线积压的日记
  useEffect(() => {
    const onOnline = () => {
      setOfflineBanner(false);
      retryPendingSync();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // 保存/新建（同 id 覆盖）— return Promise 让 EditorPage 的 await onSave() 真正等云端确认
  const handleUpsert = (d: Diary): Promise<void> => {
    skipBackgroundSyncRef.current = true;
    setAllDiaries((prev) => {
      const next = upsertLocal(prev, d);
      saveLocal(next);
      return next;
    });
    // 🔑 处理后端返回的最终 id — 后端可能按 title 语义合并到了另一条
    return apiUpsert(d).then(r => {
      // 🔥 云端成功 → 从离线重试队列里删掉
      removeFromPendingSync(d.id);
      if (r.id && r.id !== d.id) {
        // 后端用了不同的 id（UPDATE existing 而非 INSERT 新的）
        // → 本地 state 要把旧 id 删掉，换上后端返回的新 id
        setAllDiaries(prev => {
          const cleaned = prev.filter(x => x.id !== d.id);        // 删前端生成的旧 id
          const corrected = { ...d, id: r.id };                   // 改成后端的最终 id
          const next = upsertLocal(cleaned, corrected);
          saveLocal(next);
          return next;
        });
      }
    }).catch((err) => {
      // 🔥 离线或网络不通 → 存进重试队列，网络恢复后自动重推
      console.warn("[mydiary] ☁️ 云端保存失败，暂存本地", err);
      addToPendingSync(d);
      setOfflineBanner(true);
      throw err; // ← rethrow 让 await onSave() 知道失败了
    });
  };

  // 软删（本地标记 + 延迟 5 秒云端真删，给用户撤销机会）
  const handleSoftDelete = (id: string) => {
    // 如果之前有未撤销的删除，先真删它（用户没点撤销 = 确认删除）
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      apiDelete(pendingDeleteRef.current.id).catch(() => {});
      pendingDeleteRef.current = null;
    }

    skipBackgroundSyncRef.current = true;
    const deletedDiary = allDiaries.find((x) => x.id === id);
    const title = deletedDiary?.title || "无题";

    setAllDiaries((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target) return prev;
      const softDeleted: Diary = { ...target, deletedAt: Date.now() };
      const next = upsertLocal(prev, softDeleted);
      saveLocal(next);
      return next;
    });

    // 显示撤销 Snackbar
    setUndoSnack({ id, title });

    // 5 秒后真删
    const timer = setTimeout(() => {
      apiDelete(id).catch(() => { /* offline */ });
      pendingDeleteRef.current = null;
      setUndoSnack(null);
    }, 5000);
    pendingDeleteRef.current = { id, timer };
  };

  // 撤销软删
  const handleUndoDelete = () => {
    if (!pendingDeleteRef.current) return;
    const { id, timer } = pendingDeleteRef.current;
    clearTimeout(timer);
    pendingDeleteRef.current = null;
    setUndoSnack(null);
    setAllDiaries((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target) return prev;
      const restored: Diary = { ...target, deletedAt: undefined };
      const next = upsertLocal(prev, restored);
      saveLocal(next);
      apiUpsert(restored).catch(() => {});
      return next;
    });
  };

  // 从回收站恢复
  const handleRestore = (id: string) => {
    setAllDiaries((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target) return prev;
      const restored: Diary = { ...target, deletedAt: undefined };
      const next = upsertLocal(prev, restored);
      saveLocal(next);
      apiUpsert(restored).catch(() => {});
      return next;
    });
  };

  // 批量恢复
  const handleBatchRestore = (ids: string[]) => {
    if (ids.length === 0) return;
    setAllDiaries((prev) => {
      let next = prev;
      for (const id of ids) {
        const target = prev.find((x) => x.id === id);
        if (!target) continue;
        const restored: Diary = { ...target, deletedAt: undefined };
        next = upsertLocal(next, restored);
        apiUpsert(restored).catch(() => {});
      }
      saveLocal(next);
      return next;
    });
  };

  // 永久删除（彻底从本地移除）
  const handlePermanentDelete = (id: string) => {
    setAllDiaries((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveLocal(next);
      return next;
    });
    apiDelete(id).catch(() => {});
  };

  // 批量永久删除
  const handleBatchPermanentDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    setAllDiaries((prev) => {
      const next = prev.filter((x) => !ids.includes(x.id));
      saveLocal(next);
      return next;
    });
    for (const id of ids) {
      apiDelete(id).catch(() => {});
    }
  };

  // 🛡️ 守卫（所有 Hook 必须在条件 return 之前已声明）
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="text-paper-ink2 text-sm">加载中...</div>
      </div>
    );
  }
  if (!auth.loggedIn) {
    return <LoginPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper-bg">
        <div className="text-paper-ink2">加载中...</div>
      </div>
    );
  }

  return (
    <>
      {offlineBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-100 text-yellow-800 text-xs text-center py-1 animate-[fade-in_0.3s]">
⚠️ 云端保存失败，已暂存本地，联网后自动同步
        </div>
      )}
      {auth.isDemo && !demoBannerClosed && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 text-amber-900 text-xs text-center py-1.5 px-4 flex items-center justify-center gap-2">
          <span>🌾 当前是演示账号哦，所有数据每天都会重置；用邮箱注册一下，拥有你自己的专属小本子～</span>
          <button
            onClick={closeDemoBanner}
            className="text-amber-600 hover:text-amber-900 transition ml-1"
            aria-label="关闭演示提示"
          >×</button>
        </div>
      )}

      {/* Demo 专属引导 Modal — 登录后弹一次，告诉用户核心 AI 能力 */}
      {auth.isDemo && showDemoWelcome && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-[fade-in_0.3s]">
          <div className="bg-paper-surface rounded-2xl shadow-2xl border border-paper-line max-w-md w-full p-6 relative animate-[slide-up_0.3s]">
            <button
              onClick={closeDemoWelcome}
              className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-paper-hover text-paper-muted flex items-center justify-center transition"
              aria-label="关闭"
            >×</button>

            <div className="text-center mb-5">
              <div className="text-4xl mb-2">🌾</div>
              <h2 className="text-xl font-semibold text-ink-primary">欢迎来到「我的日记」</h2>
              <p className="text-sm text-paper-muted mt-1">这是演示账号，让你 30 秒感受下产品灵魂</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                <div className="text-2xl leading-none mt-0.5">🎙️</div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-ink-primary">说话就能写日记</div>
                  <div className="text-xs text-paper-muted mt-0.5">点底栏中间的 🎙️ 语音快记，说几句小麦帮你整理成结构化日记</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                <div className="text-2xl leading-none mt-0.5">🌾</div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-ink-primary">小麦帮你润色 / 起标题 / 写结尾</div>
                  <div className="text-xs text-paper-muted mt-0.5">进任意一篇日记 → 点右下角 🌾 小麦助手 → 一键贴到日记里</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100">
                <div className="text-2xl leading-none mt-0.5">🕸️</div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-ink-primary">双向链接知识维基</div>
                  <div className="text-xs text-paper-muted mt-0.5">小麦会自动发现日记里反复出现的人物和想法，帮你整理成互相链接的知识库</div>
                </div>
              </div>
            </div>

            <button
              onClick={closeDemoWelcome}
              className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium text-sm hover:from-amber-500 hover:to-orange-500 transition shadow-sm"
            >
              好哒，让我试试 ✨
            </button>

            <p className="text-center text-xs text-paper-muted mt-3">💡 演示数据每天中午 12 点重置一次</p>
          </div>
        </div>
      )}

      {/* 删除撤销 Snackbar — 底部 fixed，5 秒自动消失 */}
      {undoSnack && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-paper-ink text-paper-card shadow-lg text-sm animate-[fade-in_0.2s]">
          <span>已删除「{undoSnack.title}」</span>
          <button
            onClick={handleUndoDelete}
            className="px-2.5 py-0.5 rounded-md bg-white/20 hover:bg-white/30 font-medium transition"
          >撤销</button>
          <span className="text-xs text-white/50">5s</span>
        </div>
      )}

      <Routes>
        <Route path="/" element={<CalendarPage diaries={diaries} onSoftDelete={handleSoftDelete} />} />
        <Route path="/diaries" element={<DiaryListPage diaries={diaries} />} />
        <Route path="/trash" element={<TrashPage diaries={deletedDiaries} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} onBatchRestore={handleBatchRestore} onBatchPermanentDelete={handleBatchPermanentDelete} />} />
        <Route path="/tags" element={<TagsPage diaries={allDiaries} onDiariesChange={setAllDiaries} />} />
        <Route path="/capsule" element={<CapsulePage diaries={diaries} />} />
        <Route path="/milestones" element={<MilestonesPage />} />
        <Route path="/plans" element={<PlanPage />} />
<Route path="/finance" element={<FinancePage diaries={diaries} />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/shelf" element={<BookShelfPage diaries={diaries} />} />
        <Route path="/sources" element={<SourcesPanel />} />
        <Route
          path="/editor"
          element={<EditorPageWrapper mode="new" allDiaries={allDiaries} onUpsert={handleUpsert} onSoftDelete={handleSoftDelete} />}
        />
        <Route
          path="/editor/:id"
          element={<EditorPageWrapper mode="edit" allDiaries={allDiaries} onUpsert={handleUpsert} onSoftDelete={handleSoftDelete} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function EditorPageWrapper(props: {
  mode: "new" | "edit";
  allDiaries: Diary[];
  onUpsert: (d: Diary) => Promise<void> | void;
  onSoftDelete: (id: string) => Promise<void> | void;
}) {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const existing = id ? props.allDiaries.find((d) => d.id === id && !d.deletedAt) : undefined;
  const templateId = sp.get("template") ?? "diary";

  // 🔑 AI 快记：用 useMemo 空依赖读 sessionStorage
  // 这样 React StrictMode 双调用也只会执行一次
  const { initialPolished, templateIdOverride } = useMemo(() => {
    let polished: { title?: string; blocks?: DiaryBlock[]; moodId?: MoodId; tags?: string[] } | undefined;
    let tplOverride: string | undefined;
    try {
      const raw = sessionStorage.getItem("mydiary.quickentry");
      if (raw) {
        const data = JSON.parse(raw);
        sessionStorage.removeItem("mydiary.quickentry"); // 立即清，防止重复注入
        if (data?.polished) {
          polished = {
            title: data.polished.title,
            blocks: data.polished.blocks,
            moodId: data.polished.mood as MoodId | undefined,
            tags: data.polished.tags,
          };
        }
        if (data.templateId) tplOverride = data.templateId;
      }
    } catch { /* ignore */ }
    return { initialPolished: polished, templateIdOverride: tplOverride };
  }, []);

  if (props.mode === "edit" && !existing) {
    return <Navigate to="/editor" replace />;
  }

  // 如果 VoiceQuickEntry 传了 templateId，优先用它
  const effectiveTemplateId = templateIdOverride ?? templateId;
  console.info("[QuickEditor] 📥 templateId=", templateId, "polished=", !!initialPolished, "templateIdOverride=", templateIdOverride);

  return (
    <EditorPage
      initialDiary={existing}
      initialTemplateId={effectiveTemplateId}
      initialPolished={initialPolished}
      onSave={async (d) => { await props.onUpsert(d); }}
      onSoftDelete={(d) => { props.onSoftDelete(d.id); window.history.back(); }}
      onCancel={() => window.history.back()}
      allDiaries={props.allDiaries}
    />
  );
}
