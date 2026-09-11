import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import type { Diary } from "./types";
import { loadDiaries, upsertDiary, deleteDiary, seedIfEmpty } from "./storage";
import { healthCheck } from "./api";
import CalendarPage from "./components/CalendarPage";
import EditorPage from "./components/EditorPage";

export default function App() {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    async function init() {
      seedIfEmpty();
      const list = await loadDiaries();
      setDiaries(list);
      setLoading(false);
      setOnline(await healthCheck());
    }
    init();
  }, []);

  const handleUpsert = async (d: Diary) => {
    const next = await upsertDiary(diaries, d);
    setDiaries(next);
  };
  const handleDelete = async (id: string) => {
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
      {/* 同步状态条 */}
      {online === false && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-100 text-yellow-800 text-xs text-center py-1">
          ⚠️ 当前离线（数据仅保存在本地，联网后自动同步）
        </div>
      )}
      {online === true && (
        <div className="hidden">{/* 隐藏状态条 */}</div>
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
      onSave={async (d) => { await props.onUpsert(d); nav("/"); }}
      onDelete={async (d) => { await props.onDelete(d.id); nav("/"); }}
      onCancel={() => nav("/")}
    />
  );
}
