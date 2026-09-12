import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import type { Diary } from "./types";
import { loadDiaries, seedIfEmpty } from "./storage";
import { upsertDiary as apiUpsert, deleteDiary as apiDelete } from "./api";
import CalendarPage from "./components/CalendarPage";
import EditorPage from "./components/EditorPage";
import TrashPage from "./components/TrashPage";
import TagsPage from "./components/TagsPage";

function saveLocal(list: Diary[]) {
  localStorage.setItem("mydiary-web:diaries:v1", JSON.stringify(list));
  console.info("[mydiary] 💾 saveLocal →", list.length, "条");
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
// 只按 id 去重（同 id 多份 → 留最新 updatedAt 的那条）
function dedupeDiaries(list: Diary[]): Diary[] {
  const byId = new Map<string, Diary>();
  for (const d of list) {
    const existing = byId.get(d.id);
    if (!existing || d.updatedAt > existing.updatedAt) byId.set(d.id, d);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function App() {
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
      if (raw) {
        try {
          let parsed: Diary[] = JSON.parse(raw);
          const cleaned = dedupeDiaries(parsed);
          if (cleaned.length !== parsed.length) {
            saveLocal(cleaned);
          }
          setAllDiaries(cleaned);
        } catch { /* ignore */ }
      }
      setLoading(false);

      // 后台静默 sync
      fetch(`${import.meta.env.VITE_API_BASE ?? "https://mydiary-api.mcartneyliu.workers.dev"}/api/health`)
        .then((r) => r.ok)
        .then(async (online) => {
          if (!online) return;
          const fresh = await loadDiaries().catch(() => null);
          if (!fresh) return;
          if (!skipBackgroundSyncRef.current) {
            setAllDiaries(fresh);
          }
        })
        .catch(() => { /* 离线 */ });
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
    apiUpsert(d).catch(() => { /* offline */ });
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
      // 重新云端 upsert
      apiUpsert(restored).catch(() => { /* offline */ });
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
    apiDelete(id).catch(() => { /* offline */ });
  };

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
        <Route path="/" element={<CalendarPage diaries={diaries} />} />
        <Route path="/trash" element={<TrashPage diaries={deletedDiaries} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} />} />
        <Route path="/tags" element={<TagsPage diaries={diaries} />} />
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
  const nav = useNavigate();
  const existing = id ? props.allDiaries.find((d) => d.id === id && !d.deletedAt) : undefined;

  if (props.mode === "edit" && !existing) {
    return <Navigate to="/editor" replace />;
  }

  return (
    <EditorPage
      initialDiary={existing}
      onSave={(d) => { props.onUpsert(d); }}
      onSoftDelete={(d) => { props.onSoftDelete(d.id); nav("/", { replace: true }); }}
      onCancel={() => nav("/", { replace: true })}
    />
  );
}
