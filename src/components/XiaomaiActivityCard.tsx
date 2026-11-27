import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { xiaomaiActivity, deleteMemory, type XiaomaiActivityItem } from "../api";
import { toast } from "../uiFeedback";

// 🌾 小麦这几天帮你做了什么：每类一行，卡片里最多 4 行，「查看全部」展开
const KIND_ICON: Record<string, string> = { person: "👤", place: "📍", event: "✨", other: "✨" };

function Row({ icon, children, onClick }: { icon: string; children: React.ReactNode; onClick?: () => void }) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`w-full flex items-start gap-2 text-left py-1.5 ${onClick ? "hover:bg-amber-50/60 -mx-2 px-2 rounded-lg transition" : ""}`}>
      <span className="shrink-0 w-5 text-center">{icon}</span>
      <span className="flex-1 min-w-0 text-xs text-paper-ink leading-relaxed">{children}</span>
      {onClick && <span className="shrink-0 text-[11px] text-paper-ink3 mt-0.5">›</span>}
    </Tag>
  );
}

export default function XiaomaiActivityCard() {
  const nav = useNavigate();
  const [items, setItems] = useState<XiaomaiActivityItem[] | null>(null);
  const [all, setAll] = useState(false);
  const [hiddenMem, setHiddenMem] = useState<number[]>([]);

  useEffect(() => { xiaomaiActivity(7).then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);
  if (!items || items.length === 0) return null;

  const render = (it: XiaomaiActivityItem, i: number) => {
    switch (it.kind) {
      case "milestone":
        return <div key={i} className="my-1 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-100 to-rose-50 text-sm text-paper-ink">🏅 {it.text} 🎉</div>;
      case "met":
        return (
          <Row key={i} icon="🧑">
            新认识了{" "}
            {it.links!.slice(0, 4).map((l) => (
              <button key={l.id} type="button" onClick={() => nav("/people/" + l.id)} className="mr-1 px-1.5 rounded-full bg-paper-card border border-amber-200 hover:bg-amber-50">
                {KIND_ICON[l.kind] || "✨"} {l.title}
              </button>
            ))}
            {it.links!.length > 4 ? `等 ${it.links!.length} 个` : ""}
          </Row>
        );
      case "linked":
        return <Row key={i} icon="🔗" onClick={() => nav("/people")}>发现了 {it.count} 个新联系：{it.pairs!.slice(0, 2).map((p) => `${p.a} ↔ ${p.b}`).join("、")}</Row>;
      case "organized":
        return <Row key={i} icon="📚" onClick={() => nav("/people")}>整理好了 {it.count} 份资料，放进了{it.kbs!.map((k) => `「${k.title}」`).join("")}</Row>;
      case "pending":
        return <Row key={i} icon="⏳" onClick={() => nav("/people")}>还有 {it.count} 份资料在整理，整理好就能问小麦了</Row>;
      case "collected":
        return <Row key={i} icon="📥" onClick={() => nav("/people")}>这几天帮你收进知识库 {it.count} 条{it.kbs!.length > 1 ? `（${it.kbs!.map((k) => `${k.title} ${k.count}`).join(" · ")}）` : ""}</Row>;
      case "grew":
        return <Row key={i} icon="🌱" onClick={() => nav("/people")}>{it.kbs!.map((k) => `「${k.title}」新增 ${k.count} 页`).join("，")}</Row>;
      case "recalled":
        return <Row key={i} icon="💬" onClick={() => nav("/xiaomai")}>回答了你 {it.count} 个问题{it.diaries ? `，翻了 ${it.diaries} 篇日记` : ""}</Row>;
      case "wrote":
        return <Row key={i} icon="✍️" onClick={() => it.diary && nav("/editor/" + it.diary.id)}>你从今日看点写下了 {it.count} 篇感想{it.diary?.title ? `，最近一篇「${it.diary.title}」` : ""}</Row>;
      case "picked":
        return <Row key={i} icon="📰">今天从 {it.scanned} 条内容里帮你挑了 {it.count} 条</Row>;
      case "voice":
        return <Row key={i} icon="🎙️">帮你把 {it.count} 段语音变成了文字</Row>;
      case "connected":
        return <Row key={i} icon="🕰️" onClick={() => it.ref?.diary_id && nav("/editor/" + it.ref.diary_id)}>写日记时，帮你想起了 {it.count} 篇过去的日记{it.ref?.date ? `，比如 ${it.ref.date} 那篇` : ""}</Row>;
      case "tidied":
        return (
          <Row key={i} icon="🧹" onClick={() => nav(it.merges?.[0]?.into_id ? "/people/" + it.merges[0].into_id : "/people")}>
            帮你整理了{it.merges?.length ? `：把「${it.merges[0].from}」合并进「${it.merges[0].into}」` : ""}{it.fixed ? `${it.merges?.length ? "，" : "："}修好了 ${it.fixed} 处关联` : ""}
          </Row>
        );
      case "remembered": {
        const mems = it.memories!.filter((m) => !hiddenMem.includes(m.id));
        if (!mems.length) return null;
        return (
          <div key={i} className="py-1.5">
            <div className="flex items-start gap-2 text-xs text-paper-ink">
              <span className="shrink-0 w-5 text-center">💡</span>
              <span className="flex-1">记住了 · <span className="text-paper-ink3">不对的点 ✕ 删掉</span></span>
            </div>
            <div className="mt-1 ml-7 flex flex-wrap gap-1.5">
              {mems.slice(0, 3).map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full bg-paper-card border border-paper-line/70 text-paper-ink2">
                  {m.content.length > 18 ? m.content.slice(0, 18) + "…" : m.content}
                  <button type="button" title="删掉这条" onClick={async () => {
                    try { await deleteMemory(m.id); setHiddenMem((h) => [...h, m.id]); toast("已经忘掉了", "ok"); } catch { toast("没删掉，稍后再试", "error"); }
                  }} className="w-4 h-4 rounded-full hover:bg-paper-surface text-paper-ink3">✕</button>
                </span>
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const shown = all ? items : items.slice(0, 4);
  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-paper-card border border-amber-100 shadow-card px-4 py-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="section-label">🌾 小麦这几天帮你做了</span>
        {items.length > 4 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] text-paper-ink3 hover:text-paper-ink">
            {all ? "收起" : `查看全部 ${items.length} 项 ›`}
          </button>
        )}
      </div>
      <div>{shown.map(render)}</div>
    </section>
  );
}
