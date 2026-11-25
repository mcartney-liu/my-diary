import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BottomDock from "./BottomDock";
import { MemoriesHeader } from "./MemoriesSwitch";
import { toast, confirmAsync, promptAsync } from "../uiFeedback";
import { moodById } from "../data";
import {
  lifeOverview, lifePage, lifeRename, lifeMerge, lifeDelete, kbOverview, kbQuickCreate, wikiDeleteKb, lifeRepairLinks,
  type LifeItem, type LifeKind, type LifePageDetail, type KbCard,
} from "../api";
import CollectSheet from "./CollectSheet";
import KnowledgeBase from "./KnowledgeBase";

// 🧭 知识 —— 上：小麦从日记里自动整理的「我的生活」；下：用户自己的知识库
// 用户只需要懂三件事：小麦认识了谁、去过哪、发生过什么；认错了可以改名、合并、删掉

const KIND_META: Record<LifeKind, { label: string; icon: string; empty: string }> = {
  person: { label: "人物", icon: "👤", empty: "还没认识谁～写日记时提到家人朋友，小麦就会记住 TA" },
  place:  { label: "地点", icon: "📍", empty: "还没有地点～写写去过的地方吧" },
  event:  { label: "事件", icon: "✨", empty: "还没有事件～重要的日子写下来，小麦帮你记着" },
  other:  { label: "其他", icon: "📄", empty: "" },
};
const TABS: LifeKind[] = ["person", "place", "event"];

// ============ 列表页 /people ============
export default function PeoplePage() {
  const { id } = useParams();
  if (id) return <PeopleDetail id={id} />;
  return <KnowledgeHub />;
}

function ago(ts: number | null): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;   // 兼容秒级时间戳（wiki_knowledge_bases.updated_at 有一部分是秒）
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d <= 0) return "今天更新";
  if (d < 30) return `${d} 天前更新`;
  return `${Math.floor(d / 30)} 个月前更新`;
}

// ============ 「知识」主页 /people ============
// 上：🌾 我的生活（小麦从日记里自动整理的人物 / 地点 / 事件）
// 下：📚 我的知识库（菜谱、读书、旅行……自己建的库），一句话就能新建，粘贴就能收录
function KnowledgeHub() {
  const [cards, setCards] = useState<KbCard[] | null>(null);
  const [presets, setPresets] = useState<KbCard[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [life, setLife] = useState<KbCard | null>(null);
  const [collectFor, setCollectFor] = useState<string | undefined | null>(null);   // null = 关闭；undefined = 让小麦选
  const [openKb, setOpenKb] = useState<(KbCard & { official?: boolean; graph?: boolean }) | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoadError(false);
    return kbOverview()
      .then((r) => { setCards(r.kbs); setPresets(r.presets ?? []); setLife(r.life); })
      // 失败（比如后端还没部署新接口）≠ 没有知识库：显示错误，不显示"建一个"的空状态
      .catch(() => { setLoadError(true); setCards([]); });
  };
  useEffect(() => {
    load();
    // 一次性修复旧数据：每个人物 / 地点只挂在真正提到 TA 的日记上（v1 = 2026-11-25 的修复）
    try {
      if (localStorage.getItem("mydiary.life.repair") !== "v1") {
        lifeRepairLinks().then(() => { try { localStorage.setItem("mydiary.life.repair", "v1"); } catch {} }).catch(() => {});
      }
    } catch {}
  }, []);

  async function createKb() {
    const name = (await promptAsync({ title: "新建知识库", message: "起个名字，比如「家常菜谱」「读书笔记」「宝宝成长」", placeholder: "名字" }))?.trim();
    if (!name) return;
    const purpose = (await promptAsync({ title: "这个库用来记什么？", message: "一句话就行，小麦会帮你设计好分类", placeholder: "比如：收集好吃的家常菜做法" })) ?? "";
    setCreating(true);
    try {
      await kbQuickCreate(name, purpose);
      toast("建好了，粘贴内容进去试试 ✨", "ok");
      load();
    } catch (e: any) {
      toast(String(e?.message || "").startsWith("409") ? "已经有同名知识库了" : "建库失败，稍后再试", "error");
    } finally { setCreating(false); }
  }

  if (openKb) {
    return (
      <div className="min-h-screen bg-paper-bg pb-40">
        <MemoriesHeader current="people" subtitle={openKb.title}>
          <div className="mt-2.5 flex items-center gap-2">
            <button type="button" onClick={() => { setOpenKb(null); load(); }} className="h-7 px-3 rounded-full text-xs border border-paper-line/70 bg-paper-card text-paper-ink2">‹ 返回知识</button>
            <button type="button" onClick={() => setCollectFor(openKb.id)} className="h-7 px-3 rounded-full text-xs bg-paper-accent text-white">📥 收进这里</button>
            {!openKb.official && (
              <button type="button" onClick={async () => {
                const ok = await confirmAsync({
                  title: `删除「${openKb.title}」？`,
                  message: "这个知识库里的页面、资料和分类都会一起删除，不能恢复。你的日记不受影响。",
                  confirmText: "删除", confirmTone: "danger",
                });
                if (!ok) return;
                try { await wikiDeleteKb(openKb.id); toast("已删除", "ok"); setOpenKb(null); load(); }
                catch { toast("删除失败，稍后再试", "error"); }
              }} className="ml-auto h-7 px-3 rounded-full text-xs border border-rose-200 bg-rose-50 text-rose-700">删除</button>
            )}
          </div>
        </MemoriesHeader>
        <main className="max-w-2xl mx-auto px-4 pt-3">
          {/* 复用原有知识库组件的列表 / 图谱 / 详情（只展示这一个库） */}
          <KnowledgeBase minimal defaultTab="list" onlyKbId={openKb.id} initialView={openKb.graph ? "graph" : "detail"} />
        </main>
        <CollectSheet open={collectFor !== null} defaultKbId={collectFor ?? undefined} onClose={() => setCollectFor(null)} />
        <BottomDock active="memories" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      <MemoriesHeader current="people" subtitle="小麦帮你整理的人、地方，和你收藏的知识" />
      <main className="max-w-2xl mx-auto px-4 pt-3 space-y-6">
        {/* 🌾 我的生活 */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-sm font-semibold text-paper-ink">🌾 我的生活</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-paper-ink3">
                {life ? `${life.pages} 页${life.pending ? ` · 还有 ${life.pending} 篇在整理` : ""}` : "从日记里自动整理"}
              </span>
              {life && life.pages > 0 && (
                <button type="button" onClick={() => setOpenKb({ ...life, title: "🌾 我的生活 · 关系图", official: true, graph: true })}
                  className="h-6 px-2.5 rounded-full text-[11px] border border-paper-line/70 bg-paper-card text-paper-ink2 hover:text-paper-ink">🕸️ 关系图</button>
              )}
            </div>
          </div>
          <PeopleList embedded />
        </section>

        {/* 📚 我的知识库 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-sm font-semibold text-paper-ink">📚 我的知识库</h2>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setCollectFor(undefined)} className="h-7 px-3 rounded-full text-xs bg-paper-accent text-white">📥 收进知识库</button>
              <button type="button" disabled={creating} onClick={createKb} className="h-7 px-3 rounded-full text-xs border border-paper-line/70 bg-paper-card text-paper-ink2 disabled:opacity-50">＋ 新建</button>
            </div>
          </div>
          {cards === null ? (
            <div className="text-center py-8 text-xs text-paper-ink2 animate-pulse">加载中…</div>
          ) : loadError ? (
            <div className="rounded-2xl border border-paper-line/70 bg-paper-card px-4 py-6 text-center">
              <div className="text-sm text-paper-ink">知识库暂时没加载出来</div>
              <div className="text-xs text-paper-ink2 mt-1">可能是网络不稳，或者服务正在更新</div>
              <button type="button" onClick={() => load()} className="mt-3 text-xs px-3 py-1 rounded-full border border-paper-line/70 text-paper-ink2 hover:text-paper-ink">重新加载</button>
            </div>
          ) : cards.length === 0 ? (
            <button type="button" onClick={createKb}
              className="w-full rounded-2xl border-2 border-dashed border-paper-line px-4 py-6 text-center hover:bg-paper-surface transition">
              <div className="text-2xl mb-1">📚</div>
              <div className="text-sm text-paper-ink">建一个自己的知识库</div>
              <div className="text-xs text-paper-ink2 mt-1">菜谱、读书笔记、旅行攻略、孩子的成长……一句话就能建好</div>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {cards.map((k) => (
                <button key={k.id} type="button" onClick={() => setOpenKb(k)}
                  className="text-left rounded-2xl bg-paper-card border border-paper-line/70 shadow-card p-3.5 hover:shadow-cardHover transition active:scale-[0.99]">
                  <div className="font-medium text-paper-ink text-sm truncate">{k.title}</div>
                  {k.description && <div className="text-[11px] text-paper-ink2 mt-0.5 line-clamp-2 min-h-[2.2em]">{k.description}</div>}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-paper-ink3">
                    <span><b className="text-paper-ink text-sm">{k.pages}</b> 页</span>
                    <span>{k.pending ? `⏳ ${k.pending} 份整理中` : ago(k.last_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 🎁 官方知识库：现成的分类和范本，往里放内容就能用 */}
        {presets.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-sm font-semibold text-paper-ink">🎁 官方知识库</h2>
              <span className="text-[11px] text-paper-ink3">分类都配好了，往里放内容就能用</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map((k) => (
                <button key={k.id} type="button" onClick={() => setOpenKb({ ...k, official: true })}
                  className="text-left rounded-2xl bg-paper-surface border border-dashed border-paper-line px-3.5 py-3 hover:bg-paper-card hover:border-solid transition">
                  <div className="text-sm text-paper-ink truncate">{k.title}</div>
                  {k.description && <div className="text-[11px] text-paper-ink2 mt-0.5 line-clamp-2">{k.description}</div>}
                  <div className="text-[11px] text-paper-accent mt-1.5">开始使用 ›</div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      <CollectSheet open={collectFor !== null} defaultKbId={collectFor ?? undefined} onClose={() => setCollectFor(null)} onDone={() => load()} />
      <BottomDock active="memories" />
    </div>
  );
}

function PeopleList({ embedded = false }: { embedded?: boolean }) {
  const nav = useNavigate();
  const [tab, setTab] = useState<LifeKind>("person");
  const [items, setItems] = useState<LifeItem[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    lifeOverview()
      .then((r) => { setItems(r.items); setPending(r.pending); })
      .catch(() => setError(true));
  }, []);

  const shown = useMemo(() => (items || []).filter((x) => x.kind === tab).slice(0, embedded ? 8 : 500), [items, tab, embedded]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of items || []) c[x.kind] = (c[x.kind] || 0) + 1;
    return c;
  }, [items]);

  const content = (
    <>
        <div className="flex items-center gap-1.5 mb-3">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`shrink-0 h-7 px-3 rounded-full text-xs border transition ${
                tab === k ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70"
              }`}
            >
              {KIND_META[k].icon} {KIND_META[k].label}{counts[k] ? <span className="opacity-60 ml-1">{counts[k]}</span> : null}
            </button>
          ))}
        </div>


        {pending > 0 && (
          <div className="text-xs text-paper-ink2 bg-paper-surface border border-paper-line rounded-xl px-3 py-2">
            ⏳ 还有 {pending} 篇日记小麦正在慢慢整理，过一会儿再来看看～
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center text-center py-16 gap-2">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-amber-300 flex items-center justify-center text-2xl">🌾</div>
            <div className="text-sm text-paper-ink">小麦还在整理你的日记</div>
            <div className="text-xs text-paper-ink2">过一会儿再来看看吧</div>
            <button type="button" onClick={() => { setError(false); setItems(null); lifeOverview().then((r) => { setItems(r.items); setPending(r.pending); }).catch(() => setError(true)); }}
              className="mt-2 text-xs px-3 py-1 rounded-full border border-paper-line/70 bg-paper-card text-paper-ink2 hover:text-paper-ink">重新加载</button>
          </div>
        ) : items === null ? (
          <div className="text-center py-16 text-paper-ink2 text-sm animate-pulse">小麦翻日记中…</div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 gap-2">
            <div className="w-14 h-14 rounded-full bg-paper-card border border-paper-line/70 shadow-card flex items-center justify-center text-2xl">{KIND_META[tab].icon}</div>
            <div className="text-sm text-paper-ink2 max-w-[16rem]">{KIND_META[tab].empty}</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => nav("/people/" + x.id)}
                  className="w-full text-left rounded-2xl bg-paper-card border border-paper-line/70 shadow-card px-4 py-3 hover:shadow-cardHover transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-300 flex items-center justify-center text-base font-medium text-paper-ink">
                      {x.kind === "person" ? x.title.slice(0, 1) : KIND_META[x.kind].icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-paper-ink truncate">{x.title}</span>
                        {x.mentions > 0 && <span className="shrink-0 text-[11px] text-paper-ink2">{x.mentions} 篇日记</span>}
                      </div>
                      {x.summary && <p className="text-xs text-paper-ink2 mt-0.5 line-clamp-1">{x.summary}</p>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
  if (embedded) return <div className="space-y-3">{content}</div>;
  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      <MemoriesHeader current="people" subtitle="小麦从日记里整理的人和地方，认错了可以改" />
      <main className="max-w-2xl mx-auto px-4 pt-3 space-y-3">{content}</main>
      <BottomDock active="memories" />
    </div>
  );
}

// ============ 详情页 /people/:id ============
function PeopleDetail({ id }: { id: string }) {
  const nav = useNavigate();
  const [data, setData] = useState<LifePageDetail | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const [candidates, setCandidates] = useState<LifeItem[]>([]);

  const load = () => {
    setError(false);
    lifePage(id).then(setData).catch(() => setError(true));
  };
  useEffect(load, [id]);

  async function rename() {
    if (!data) return;
    const v = await promptAsync({ title: "改个名字", message: "比如把「宝贝」改成「女儿」", defaultValue: data.page.title });
    const name = (v || "").trim();
    if (!name || name === data.page.title) return;
    setBusy(true);
    try {
      await lifeRename(id, name);
      toast("已改名", "ok");
      load();
    } catch (e: any) {
      if (String(e?.message || "").startsWith("409")) {
        toast(`已经有「${name}」了，可以用「合并」把两页合成一页`, "error");
      } else {
        toast("改名失败，稍后再试", "error");
      }
    } finally { setBusy(false); }
  }

  async function openMerge() {
    if (!data) return;
    try {
      const r = await lifeOverview();
      setCandidates(r.items.filter((x) => x.id !== id && x.kind === data.page.kind));
      setMerging(true);
    } catch { toast("加载失败，稍后再试", "error"); }
  }

  async function doMerge(into: LifeItem) {
    if (!data) return;
    const ok = await confirmAsync({
      title: "合并成一页？",
      message: `「${data.page.title}」会并进「${into.title}」，提到 TA 的日记都会归到一起。`,
      confirmText: "合并",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await lifeMerge(id, into.id);
      toast("已合并", "ok");
      setMerging(false);
      nav("/people/" + r.into_id, { replace: true });
    } catch { toast("合并失败，稍后再试", "error"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!data) return;
    const ok = await confirmAsync({
      title: "删掉这一页？",
      message: "只删除小麦整理的这一页，你的日记不会受影响。",
      confirmText: "删除",
      confirmTone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await lifeDelete(id);
      toast("已删除", "ok");
      nav("/people", { replace: true });
    } catch { toast("删除失败，稍后再试", "error"); }
    finally { setBusy(false); }
  }

  const meta = data ? KIND_META[data.page.kind] : KIND_META.other;

  return (
    <div className="min-h-screen bg-paper-bg pb-40">
      <header className="sticky top-0 z-30 bg-paper-bg/90 backdrop-blur-md border-b border-paper-line/60 px-4 py-3 header-safe">
        <div className="max-w-xl mx-auto flex items-center gap-2">
          <button type="button" onClick={() => nav(-1)} className="text-paper-ink2 hover:text-paper-ink px-1" aria-label="返回">‹</button>
          <h1 className="flex-1 min-w-0 text-lg font-bold text-paper-ink truncate">
            {data ? `${meta.icon} ${data.page.title}` : "…"}
          </h1>
          {data && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" disabled={busy} onClick={rename} className="text-xs px-2.5 py-1 rounded-full border border-paper-line bg-paper-surface hover:bg-paper-line/40 disabled:opacity-50">改名</button>
              <button type="button" disabled={busy} onClick={openMerge} className="text-xs px-2.5 py-1 rounded-full border border-paper-line bg-paper-surface hover:bg-paper-line/40 disabled:opacity-50">合并</button>
              <button type="button" disabled={busy} onClick={remove} className="text-xs px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50">删除</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {error ? (
          <div className="text-center py-16 text-paper-ink2 text-sm">这一页找不到了，可能已经被合并或删除</div>
        ) : !data ? (
          <div className="text-center py-16 text-paper-ink2 text-sm animate-pulse">加载中…</div>
        ) : (
          <>
            {data.page.summary && (
              <section className="rounded-2xl bg-paper-card border border-paper-line/70 shadow-card px-4 py-3">
                <div className="text-xs text-paper-ink2 mb-1">🌾 小麦的印象</div>
                <p className="text-sm text-paper-ink leading-relaxed">{data.page.summary}</p>
              </section>
            )}

            {data.page.content && (
              <section className="rounded-2xl bg-paper-card border border-paper-line/70 shadow-card px-4 py-3 text-sm leading-relaxed text-paper-ink [&_h2]:font-medium [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.page.content.replace(/\[\[([^\]]+)\]\]/g, "$1")}
                </ReactMarkdown>
              </section>
            )}

            {data.related.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-paper-ink mb-2">🔗 相关</h2>
                <div className="flex flex-wrap gap-2">
                  {data.related.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => nav("/people/" + r.id)}
                      className="text-xs px-2.5 py-1 rounded-full border border-paper-line bg-paper-surface hover:bg-paper-line/40"
                    >
                      {KIND_META[r.kind].icon} {r.title}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-medium text-paper-ink mb-2">📖 提到{data.page.kind === "person" ? " TA " : "这里"}的日记 · {data.diaries.length}</h2>
              {data.diaries.length === 0 ? (
                <p className="text-xs text-paper-ink2">暂时没有关联的日记</p>
              ) : (
                <ul className="space-y-2">
                  {data.diaries.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => nav("/editor/" + d.id)}
                        className="w-full text-left rounded-2xl bg-paper-card border border-paper-line/70 shadow-card px-3 py-2.5 hover:border-paper-accent/40 transition"
                      >
                        <div className="flex items-center gap-2 text-xs text-paper-ink2">
                          <span className="text-paper-accent">{d.date}</span>
                          {d.mood_id && <span>{moodById(d.mood_id)?.icon}</span>}
                          {d.title && <span className="truncate text-paper-ink">{d.title}</span>}
                        </div>
                        {d.snippet && <p className="text-xs text-paper-ink2 mt-1 line-clamp-2">{d.snippet}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {/* 合并：选一个同类的页面 */}
      {merging && data && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setMerging(false)}>
          <div className="w-full sm:max-w-md bg-paper-bg rounded-t-2xl sm:rounded-2xl p-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium text-paper-ink mb-1">「{data.page.title}」和谁是同一个？</div>
            <p className="text-xs text-paper-ink2 mb-3">选中后，两页会合成一页</p>
            {candidates.length === 0 ? (
              <p className="text-xs text-paper-ink2 py-6 text-center">没有可以合并的{meta.label}</p>
            ) : (
              <ul className="space-y-1.5">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => doMerge(c)}
                      className="w-full text-left px-3 py-2 rounded-xl border border-paper-line bg-paper-surface hover:bg-paper-line/40 disabled:opacity-50"
                    >
                      <span className="text-sm text-paper-ink">{meta.icon} {c.title}</span>
                      {c.mentions > 0 && <span className="text-[11px] text-paper-ink2 ml-2">{c.mentions} 篇日记</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setMerging(false)} className="mt-3 w-full text-sm py-2 rounded-xl text-paper-ink2 hover:bg-paper-line/40">取消</button>
          </div>
        </div>
      )}

      <BottomDock active="memories" />
    </div>
  );
}
