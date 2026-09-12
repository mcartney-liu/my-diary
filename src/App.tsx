import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import type { Diary } from "./types";
import { loadDiaries, seedIfEmpty } from "./storage";
import { upsertDiary as apiUpsert, deleteDiary as apiDelete } from "./api";
import CalendarPage from "./components/CalendarPage";
import EditorPage from "./components/EditorPage";

function saveLocal(list: Diary[]) {
  localStorage.setItem("mydiary-web:diaries:v1", JSON.stringify(list));
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

function deleteLocal(list: Diary[], id: string): Diary[] {
  return list.filter((x) => x.id !== id);
}

// 历史 bug 修复：之前每次保存生成新 uid 导致同一篇日记被复制多份
// 启动时按 (date, title, firstText) 去重，保留 updatedAt 最新的
function dedupeDiaries(list: Diary[]): Diary[] {
  // 第一步：按 id 去重（已经是同一 id 的肯定只留一条）
  const byId = new Map<string, Diary>();
  for (const d of list) {
    const existing = byId.get(d.id);
    if (!existing || d.updatedAt > existing.updatedAt) byId.set(d.id, d);
  }
  const unique = Array.from(byId.values());

  // 第二步：同 date + 同 title + 同首段文字 → 视为重复，留最新
  const fingerprint = (d: Diary) => {
    const firstText = d.blocks.find((b) => b.kind === "text")?.content.trim() ?? "";
    return `${d.date}|${(d.title || "").trim()}|${firstText.slice(0, 80)}`;
  };
  const seen = new Map<string, Diary>();
  for (const d of unique) {
    const fp = fingerprint(d);
    const prev = seen.get(fp);
    if (!prev || d.updatedAt > prev.updatedAt) seen.set(fp, d);
  }
  const deduped = Array.from(seen.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  return deduped;
}

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
          let parsed: Diary[] = JSON.parse(raw);
          // 清理历史重复数据（之前的 bug 导致同一篇被复制多份）
          const cleaned = dedupeDiaries(parsed);
          if (cleaned.length !== parsed.length) {
            saveLocal(cleaned); // 回写清理结果
            console.info(`[mydiary] dedupe: ${parsed.length} → ${cleaned.length} 条日记`);
          }
          setDiaries(cleaned);
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

  const handleUpsert = (d: Diary) => {
    skipBackgroundSyncRef.current = true;
    // 立即本地更新（乐观），不阻塞 UI
    setDiaries((prev) => {
      const next = upsertLocal(prev, d);
      saveLocal(next);
      return next;
    });
    // 云端后台同步
    apiUpsert(d).catch(() => { /* offline — 下次 sync 会推 */ });
  };
  const handleDelete = (id: string) => {
    skipBackgroundSyncRef.current = true;
    setDiaries((prev) => {
      const next = deleteLocal(prev, id);
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
      onSave={(d) => { props.onUpsert(d); }}
      onDelete={(d) => { props.onDelete(d.id); nav("/", { replace: true }); }}
      onCancel={() => nav("/", { replace: true })}
    />
  );
}
