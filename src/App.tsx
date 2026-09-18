import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Diary, MoodId, DiaryBlock } from "./types";
import { seedIfEmpty } from "./storage";
import { upsertDiary as apiUpsert, deleteDiary as apiDelete, listDiaries as apiListDiaries, getToken } from "./api";
import { useAuth } from "./AuthContext";
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

// 后台写入 localStorage（不阻塞主线程）
let saveQueue = Promise.resolve();
function saveLocalAsync(list: Diary[]) {
  saveQueue = saveQueue.then(() => new Promise<void>((resolve) => {
    // 用 requestIdleCallback / setTimeout 把 JSON.stringify + setItem 丢到空闲期
    const run = () => {
      try {
        const raw = JSON.stringify(list);
        localStorage.setItem("mydiary-web:diaries:v1", raw);
        console.info("[mydiary] 💾 saveLocalAsync →", list.length, "条", "≈", (raw.length / 1024 / 1024).toFixed(2), "MB");
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
function dedupeDiaries(list: Diary[]): Diary[] {
  // 第一层：按 id 去重
  const byId = new Map<string, Diary>();
  for (const d of list) {
    const existing = byId.get(d.id);
    if (!existing || d.updatedAt > existing.updatedAt) byId.set(d.id, d);
  }

  // 第二层：按语义键去重（同标题同日期同模板 → 合并）
  const financeLikeTemplates = new Set(["finance", "milestone", "plan"]);
  const finalList = Array.from(byId.values());
  const seenTitle = new Map<string, Diary>();
  const result: Diary[] = [];
  for (const d of finalList) {
    const tpl = d.templateId || "diary";
    if (!financeLikeTemplates.has(tpl)) {
      // 普通模板：直接保留
      result.push(d);
    } else {
      // finance/milestone/plan：同日期+同模板+同标题 → 留最新
      const key = `${d.date}:${tpl}:${(d.title || "").trim()}`;
      const existing = seenTitle.get(key);
      if (!existing || d.updatedAt > existing.updatedAt) {
        seenTitle.set(key, d);
      }
    }
  }
  result.push(...seenTitle.values());

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function App() {
  const auth = useAuth();
  const [allDiaries, setAllDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const skipBackgroundSyncRef = useRef(false);

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
          if (cleaned.length !== parsed.length) {
            saveLocal(cleaned);
          }
          setAllDiaries(cleaned);
        } catch { /* ignore */ }
      }
      setLoading(false);

      // 云端拉取（已登录状态下，优先用云端数据）
      if (getToken()) {
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
                weather: d.weather ? JSON.parse(d.weather) : null,
                blocks: Array.isArray(d.blocks) ? d.blocks : [],
                createdAt: d.created_at,
                updatedAt: d.updated_at,
                // 🔑 新增 4 个之前只在 localStorage 存的字段
                deletedAt: d.deleted_at ?? undefined,
                capsuleUnlockAt: d.capsule_unlock_at ?? undefined,
                wallpaper: d.wallpaper ?? undefined,
                showLines: d.show_lines ?? 1,
              }));
              const merged = dedupeDiaries([...cleaned, ...mapped]);
              setAllDiaries(merged);
              saveLocal(merged);
            }
          })
          .catch(() => { /* 离线或 token 过期，保留本地 */ });
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!offlineBanner) return;
    const t = window.setTimeout(() => setOfflineBanner(false), 5000);
    return () => window.clearTimeout(t);
  }, [offlineBanner]);

  // 保存/新建（同 id 覆盖）
  const handleUpsert = (d: Diary) => {
    skipBackgroundSyncRef.current = true;
    setAllDiaries((prev) => {
      const next = upsertLocal(prev, d);
      saveLocal(next);
      return next;
    });
    // 🔑 处理后端返回的最终 id — 后端可能按 title 语义合并到了另一条
    apiUpsert(d).then(r => {
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
    }).catch(() => { /* offline */ });
  };

  // 软删（加 deletedAt 时间戳，不立刻从列表消失）
  const handleSoftDelete = (id: string) => {
    skipBackgroundSyncRef.current = true;
    setAllDiaries((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target) return prev;
      const softDeleted: Diary = { ...target, deletedAt: Date.now() };
      const next = upsertLocal(prev, softDeleted);
      saveLocal(next);
      return next;
    });
    // 云端真删
    apiDelete(id).catch(() => { /* offline */ });
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
          Offline - saved locally, will sync when online
        </div>
      )}

      <Routes>
        <Route path="/" element={<CalendarPage diaries={diaries} onSoftDelete={handleSoftDelete} />} />
        <Route path="/trash" element={<TrashPage diaries={deletedDiaries} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} onBatchRestore={handleBatchRestore} onBatchPermanentDelete={handleBatchPermanentDelete} />} />
        <Route path="/tags" element={<TagsPage diaries={diaries} />} />
        <Route path="/capsule" element={<CapsulePage diaries={diaries} />} />
        <Route path="/milestones" element={<MilestonesPage />} />
        <Route path="/plans" element={<PlanPage />} />
<Route path="/finance" element={<FinancePage diaries={diaries} />} />
        <Route path="/profile" element={<ProfilePage />} />
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
  const nav = useNavigate();
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

  return (
    <EditorPage
      initialDiary={existing}
      initialTemplateId={effectiveTemplateId}
      initialPolished={initialPolished}
      onSave={async (d) => { await props.onUpsert(d); }}
      onSoftDelete={(d) => { props.onSoftDelete(d.id); nav(-1, { replace: true }); }}
      onCancel={() => nav(-1, { replace: true })}
      allDiaries={props.allDiaries}
    />
  );
}
