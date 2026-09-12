import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import type { Diary } from "./types";
import { loadDiaries, upsertDiary, deleteDiary, seedIfEmpty } from "./storage";
import CalendarPage from "./components/CalendarPage";
import EditorPage from "./components/EditorPage";

export default function App() {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const skipBackgroundSyncRef = useRef(false);

  useEffect(() => {
    async function init() {
      seedIfEmpty();

      // 乐观渲染：先 localStorage (0ms)，再云端
      const raw = localStorage.getItem("mydiary-web:diaries:v1");
      if (raw) {
        try {
          setDiaries(JSON.parse(raw));
        } catch { /* ignore */ }
      }
      setLoading(false);

      // 后台静默 sync（不阻塞首屏）
      fetch(`${import.meta.env.VITE_API_BASE ?? "https://mydiary-api.mcartneyliu.workers.dev"}/api/health`)
        .then((r) => r.ok)
        .then(async (online) => {
          if (!online) return;
          const fresh = await loadDiaries().catch(() => null);
          if (!fresh) return;
          if (!skipBackgroundSyncRef.current) {
            setDiaries(fresh);
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

  const handleUpsert = async (d: Diary) => {
    skipBackgroundSyncRef.current = true;
    const next = await upsertDiary(diaries, d);
    setDiaries(next);
  };
  const handleDelete = async (id: string) => {
    skipBackgroundSyncRef.current = true;
    const next = await deleteDiary(diaries, id);
    setDiaries(next);
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
        <Route
          path="/editor"
          element={<EditorPageWrapper mode="new" diaries={diaries} onUpsert={handleUpsert} onDelete={handleDelete} />}
        />
        <Route
          path="/editor/:id"
          element={<EditorPageWrapper mode="edit" diaries={diaries} onUpsert={handleUpsert} onDelete={handleDelete} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function EditorPageWrapper(props: {
  mode: "new" | "edit";
  diaries: Diary[];
  onUpsert: (d: Diary) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const { id } = useParams();
  const nav = useNavigate();
  const existing = id ? props.diaries.find((d) => d.id === id) : undefined;

  if (props.mode === "edit" && !existing) {
    return <Navigate to="/editor" replace />;
  }

  return (
    <EditorPage
      initialDiary={existing}
      onSave={async (d) => { props.onUpsert(d); nav("/", { replace: true }); }}
      onDelete={async (d) => { await props.onDelete(d.id); nav("/", { replace: true }); }}
      onCancel={() => nav("/", { replace: true })}
    />
  );
}
