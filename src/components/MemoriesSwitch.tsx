import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

// 「回忆」四个视图共用的头部：标题 + 写日记按钮 + 视图切换
// 时间线（原「日记」列表）/ 月历 / 知识（我的生活 + 我的知识库）/ 书柜
export type MemoriesView = "timeline" | "calendar" | "people" | "shelf";

const VIEWS: { key: MemoriesView; label: string; path: string }[] = [
  { key: "timeline", label: "时间线", path: "/diaries" },
  { key: "calendar", label: "月历", path: "/calendar" },
  { key: "people", label: "知识", path: "/people" },
  { key: "shelf", label: "书柜", path: "/shelf" },
];

export function MemoriesHeader({ current, subtitle, children }: { current: MemoriesView; subtitle?: string; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-paper-bg/90 backdrop-blur-md header-safe">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold text-paper-ink leading-tight tracking-wide">回忆</h1>
            {subtitle && <p className="text-xs text-paper-ink2 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => nav("/editor")}
            aria-label="写新日记"
            title="写新日记"
            className="shrink-0 w-10 h-10 rounded-full bg-paper-accent text-white flex items-center justify-center shadow-md hover:opacity-90 active:scale-95 transition"
          >
            <Plus className="w-5 h-5" strokeWidth={2.4} />
          </button>
        </div>
        <div className="mt-3"><MemoriesSwitch current={current} /></div>
        {children}
      </div>
    </header>
  );
}

// 分段切换：四个等宽，不带 emoji，选中项白底浮起
export default function MemoriesSwitch({ current }: { current: MemoriesView }) {
  const nav = useNavigate();
  return (
    <div className="grid grid-cols-4 p-1 rounded-2xl bg-paper-line/40">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => { if (v.key !== current) nav(v.path, { replace: true }); }}
          aria-current={v.key === current ? "page" : undefined}
          className={`py-1.5 rounded-xl text-sm transition ${
            v.key === current
              ? "bg-paper-card text-paper-ink font-medium shadow-sm"
              : "text-paper-ink2 hover:text-paper-ink"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
