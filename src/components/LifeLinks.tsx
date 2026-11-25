import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { lifeByDiaries, getToken, type LifeLink } from "../api";

// 一篇日记被小麦关联到的人物 / 地点 / 事件
// 批量查询：同一帧里多个组件请求会合并成一次接口调用，结果缓存在内存里
const ICON: Record<string, string> = { person: "👤", place: "📍", event: "✨", other: "📄" };
const cache = new Map<string, LifeLink[]>();
let queue = new Set<string>();
let timer: number | null = null;
const waiters = new Set<() => void>();

function request(ids: string[]) {
  for (const id of ids) if (!cache.has(id)) queue.add(id);
  if (!queue.size || timer !== null) return;
  timer = window.setTimeout(async () => {
    const batch = [...queue].slice(0, 60);
    queue = new Set([...queue].slice(60));
    timer = null;
    try {
      const r = await lifeByDiaries(batch);
      for (const id of batch) cache.set(id, r.links?.[id] ?? []);
    } catch {
      for (const id of batch) cache.set(id, []);
    }
    waiters.forEach((w) => w());
    if (queue.size) request([]);
  }, 30);
}

export function useLifeLinks(diaryId: string | undefined): LifeLink[] {
  const [links, setLinks] = useState<LifeLink[]>(() => (diaryId && cache.get(diaryId)) || []);
  useEffect(() => {
    if (!diaryId || !getToken()) return;
    if (cache.has(diaryId)) { setLinks(cache.get(diaryId)!); return; }
    const w = () => { if (cache.has(diaryId)) setLinks(cache.get(diaryId)!); };
    waiters.add(w);
    request([diaryId]);
    return () => { waiters.delete(w); };
  }, [diaryId]);
  return links;
}

/** 日记被重新保存后，下次重新查 */
export function invalidateLifeLinks(diaryId: string) { cache.delete(diaryId); }

export default function LifeLinks({ diaryId, prefix, max = 4, className = "" }: { diaryId: string; prefix?: string; max?: number; className?: string }) {
  const nav = useNavigate();
  const links = useLifeLinks(diaryId);
  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {prefix && <span className="text-[11px] text-paper-ink3">{prefix}</span>}
      {links.slice(0, max).map((l) => (
        <span
          key={l.id}
          role="link"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); nav("/people/" + l.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); nav("/people/" + l.id); } }}
          className="cursor-pointer inline-flex items-center gap-0.5 h-5 px-2 rounded-full bg-amber-50 border border-amber-100 text-[11px] text-amber-900 hover:bg-amber-100"
        >
          {ICON[l.kind] || "📄"} {l.title}
        </span>
      ))}
      {links.length > max && <span className="text-[11px] text-paper-ink3">+{links.length - max}</span>}
    </div>
  );
}
