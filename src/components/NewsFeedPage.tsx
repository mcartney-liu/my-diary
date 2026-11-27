import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listNews, trackNews, type NewsChannel, type NewsData, type NewsItem } from "../api";
import { CHANNEL_META, NEWS_TAG_STYLE, newsTime, newsDayTitle, openEditorWith } from "../newsMeta";
import NewsDetailSheet from "./NewsDetailSheet";
import SafeImg from "./SafeImg";
import BottomDock from "./BottomDock";

// 📰 全部看点：按天分组的连续列表（最近 7 天），往下滑自动加载前一天
// 今天页的卡片只放 3 条 + 换一批；想多看就点「查看全部」进来
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function NewsFeedPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const now = new Date();
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  const [channels, setChannels] = useState<NewsChannel[]>(["news"]);
  const channel = ((sp.get("channel") as NewsChannel) || "news");
  const [days, setDays] = useState<{ day: string; items: NewsItem[] }[]>([]);
  const [allDays, setAllDays] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<NewsItem | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // 换频道：从今天重新开始
  useEffect(() => {
    setDays([]); setAllDays([]); setCounts({});
    loadDay(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  async function loadDay(day?: string) {
    if (loadingRef.current) return;
    loadingRef.current = true; setLoading(true);
    try {
      const r: NewsData = await listNews(false, channel, day);
      if (r.channels?.length) setChannels(r.channels.filter((c) => c !== "quote" && c !== "psy"));
      if (r.days?.length) setAllDays(r.days);
      if ((r as any).counts) setCounts((r as any).counts);
      const d = r.day || day || today;
      setDays((list) => (list.some((x) => x.day === d) ? list : [...list, { day: d, items: r.items || [] }]));
    } catch { /* 网络不好：停在这里，用户可以点「重试」 */ }
    finally { loadingRef.current = false; setLoading(false); }
  }
  const nextDay = allDays.find((d) => !days.some((x) => x.day === d));
  const done = allDays.length > 0 && !nextDay;

  // 滑到底自动加载前一天
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && nextDay && !loadingRef.current) loadDay(nextDay); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDay, channel]);

  const write = (n: NewsItem, extra?: { points: string[]; question: string }) => {
    trackNews(n.id, "write");
    const full = n.full || n.title;
    const lines = [`今天看到一条${CHANNEL_META[channel].name === "新闻" ? "新闻" : "内容"}：${full}`];
    if (extra?.points?.length) lines.push(...extra.points.map((p) => `· ${p}`));
    if (n.link) lines.push(`（原文：${n.link}）`);
    lines.push("", extra?.question || "我的看法：");
    openEditorWith(nav, { title: `📰 ${n.title.length > 18 ? n.title.slice(0, 18) + "…" : n.title}`, body: lines.join("\n") + (extra?.question ? "\n" : ""), tags: ["看点", n.tag || ""].filter(Boolean) });
  };

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      {/* 顶栏 + 频道切换（固定在上面） */}
      <header className="sticky top-0 z-20 bg-paper-bg/95 backdrop-blur border-b border-paper-line/60 header-safe">
        <div className="max-w-xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => nav(-1)} className="w-8 h-8 -ml-1.5 rounded-full flex items-center justify-center text-paper-ink hover:bg-paper-surface">‹</button>
            <h1 className="text-base font-semibold text-paper-ink">{CHANNEL_META[channel].icon} {CHANNEL_META[channel].label}</h1>
            <span className="ml-auto text-[10px] text-paper-ink3">最近 7 天</span>
          </div>
          {channels.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
              {channels.map((c) => (
                <button key={c} type="button" onClick={() => setSp({ channel: c }, { replace: true })}
                  className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition ${c === channel ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70 hover:text-paper-ink"}`}>
                  {CHANNEL_META[c].icon} {CHANNEL_META[c].name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-3">
        {days.map(({ day, items }) => (
          <section key={day} className="mb-4">
            {/* 分组标题：今天 / 昨天 · 11月26日 / 11月25日 周三（吸顶在频道栏下面） */}
            <div className="sticky top-[92px] z-10 -mx-4 px-4 py-1.5 bg-paper-bg/90 backdrop-blur text-xs text-paper-ink2 flex items-center gap-2">
              <span className="font-medium text-paper-ink">{newsDayTitle(day, today, yesterday)}</span>
              <span className="text-paper-ink3">{counts[day] ?? items.length} 条</span>
            </div>
            {items.length === 0 ? (
              <div className="text-xs text-paper-ink3 py-3 text-center">这天没有内容</div>
            ) : (
              <ul className="card divide-y divide-paper-line/50">
                {items.map((n) => {
                  const tag = NEWS_TAG_STYLE[n.tag || ""] || NEWS_TAG_STYLE["社会"];
                  return (
                    <li key={n.id || n.title} className="px-4 py-3">
                      <button type="button" onClick={() => { setDetail(n); trackNews(n.id, "open"); }} className="w-full flex items-start gap-3 text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            {n.tag && <span className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${tag.cls}`}>{tag.icon} {n.tag}</span>}
                            <span className="text-sm leading-snug text-paper-ink line-clamp-2">
                              {n.isNew && day === today ? <span className="mr-1 align-middle text-[9px] px-1 py-px rounded bg-rose-500 text-white">新</span> : null}
                              {n.title}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-paper-ink3 truncate">{[newsTime(n.ts, channel), n.source].filter(Boolean).join(" · ")}</div>
                          {n.say && <div className="mt-1 text-xs text-paper-ink2 line-clamp-1">🌾 {n.say}</div>}
                        </div>
                        <SafeImg src={n.image} className="shrink-0 w-20 h-20 rounded-xl object-cover bg-paper-surface" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        {/* 底部：加载中 / 看更早的 / 到头了 */}
        <div ref={sentinel} className="py-6 text-center text-xs text-paper-ink3">
          {loading ? "加载中…"
            : done ? "最近 7 天的都在这里了，更早的可以去原网站看看 🌾"
            : nextDay ? <button type="button" onClick={() => loadDay(nextDay)} className="hover:text-paper-ink">看更早的 ▾</button>
            : days.length === 0 ? <button type="button" onClick={() => loadDay(undefined)} className="hover:text-paper-ink">没加载出来，点一下重试</button>
            : null}
        </div>
      </main>

      <NewsDetailSheet
        label={`${CHANNEL_META[channel].icon} ${CHANNEL_META[channel].label}`}
        item={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onWrite={(n, extra) => { setDetail(null); write(n, extra); }}
      />
      <BottomDock active="home" />
    </div>
  );
}
