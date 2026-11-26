import { useEffect, useState } from "react";
import Modal from "./Modal";
import { newsDetail, type NewsItem } from "../api";

// 今日看点详情：完整标题 · 来源摘要 · 小麦提炼的要点 · 和你有什么关系 · 看原文 / 写写看法
// 要点只根据来源自带的摘要提炼（不抓原文网页、不编造）；没有摘要（如 60s）就只显示后两块
const detailCache = new Map<string, { points: string[]; relate: string; question: string }>();

export default function NewsDetailSheet({
  item, open, onClose, onWrite,
}: {
  item: NewsItem | null;
  open: boolean;
  onClose: () => void;
  /** 写写看法：带上新闻、要点和小麦的问题去写日记 */
  onWrite: (item: NewsItem, extra: { points: string[]; question: string }) => void;
}) {
  const key = item ? (item.full || item.title) : "";
  const [data, setData] = useState<{ points: string[]; relate: string; question: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    const c = detailCache.get(key);
    if (c) { setData(c); return; }
    setData(null);
    setLoading(true);
    let cancelled = false;
    newsDetail({ title: item.full || item.title, summary: item.summary, link: item.link, source: item.source })
      .then((r) => { if (cancelled) return; detailCache.set(key, r); setData(r); })
      .catch(() => { if (!cancelled) setData({ points: [], relate: "", question: "" }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  if (!item) return null;
  const full = item.full || item.title;
  const summary = (item.summary || "").trim();

  return (
    <Modal open={open} onClose={onClose} size="md" scrollable
      title={<span className="text-xs font-normal text-paper-ink3">📰 今日看点{item.source ? ` · ${item.source}` : ""}</span>}
      footer={
        <div className="flex items-center gap-2 px-5 py-3">
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 justify-center text-center !h-10">看原文 ›</a>
          )}
          <button type="button" className="btn-primary flex-1 !h-10"
            onClick={() => onWrite(item, { points: data?.points || [], question: data?.question || "" })}>
            💬 写写看法
          </button>
        </div>
      }
    >
      <div className="px-5 pt-4 pb-5 space-y-4">
        <h3 className="text-[17px] font-semibold text-paper-ink leading-relaxed">{full}</h3>

        {/* 小麦提炼的要点（只有带摘要的来源才有） */}
        {summary.length >= 40 && (
          <section>
            <div className="text-[11px] text-paper-ink3 mb-1.5">🌾 小麦帮你划的重点</div>
            {loading && !data ? (
              <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-3.5 rounded bg-paper-surface animate-pulse" style={{ width: `${90 - i * 15}%` }} />)}</div>
            ) : data?.points?.length ? (
              <ul className="space-y-1.5">
                {data.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-paper-ink leading-relaxed">
                    <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] flex items-center justify-center">{i + 1}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-paper-ink3">小麦这次没整理出重点，直接看下面的正文吧</p>
            )}
          </section>
        )}

        {/* 和你有什么关系 */}
        <section className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3.5">
          <div className="text-[11px] font-medium text-amber-800 mb-1.5">🌾 和你有什么关系</div>
          {loading && !data ? (
            <div className="h-3.5 w-4/5 rounded bg-amber-100/70 animate-pulse" />
          ) : (
            <p className="text-sm text-paper-ink leading-relaxed">{data?.relate || item.say || "小麦这会儿没想好，你怎么看？"}</p>
          )}
          {data?.question && (
            <button type="button" onClick={() => onWrite(item, { points: data.points || [], question: data.question })}
              className="mt-2 text-xs text-paper-accent hover:underline text-left">
              ✍️ {data.question} ›
            </button>
          )}
        </section>

        {data?.points?.length ? (
          <p className="text-[10px] text-paper-ink3 leading-relaxed">
            要点由小麦根据来源提供的摘要整理，可能有遗漏，以原文为准。
          </p>
        ) : null}

        {/* 正文：来源 RSS 自己提供的内容，完整显示 + 标明来源（不额外抓原文网页） */}
        {summary && (
          <section className="pt-3 border-t border-paper-line/60">
            <div className="text-[11px] text-paper-ink3 mb-2">📄 正文{item.source ? ` · 来自${item.source}` : ""}</div>
            <div className="space-y-2.5">
              {summary.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p, i) => (
                <p key={i} className="text-sm text-paper-ink leading-[1.85]">{p}</p>
              ))}
            </div>
            {/* 底部已经有「看原文」按钮；这里只在正文被截断时提示一下 */}
            {item.link && summary.length >= 1400 && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-paper-accent hover:underline">
                后面还有，去原文继续看 ›
              </a>
            )}
            <p className="mt-2 text-[10px] text-paper-ink3">内容由{item.source || "来源网站"}通过 RSS 提供，版权归原作者所有。</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
