import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, Share2, Plus } from "lucide-react";
import type { DiaryBlock } from "../types";
import { uid } from "../types";
import { listTemplates, saveTemplate, updateTemplate, deleteTemplate, shareTemplate, type UserTemplate } from "../api";

const COMPONENT_LABELS: Record<string, string> = {
  heading: "标题", text: "文字", divider: "分割线", checkbox: "待办",
  number: "数字", finance_item: "记账", quote: "摘抄", book: "读书笔记",
};

const AVAILABLE_COMPONENTS = [
  { kind: "heading", label: "标题", icon: "📌" },
  { kind: "text", label: "文字", icon: "📝" },
  { kind: "divider", label: "分割线", icon: "➖" },
  { kind: "checkbox", label: "待办", icon: "☑️" },
  { kind: "number", label: "数字", icon: "🔢" },
  { kind: "finance_item", label: "记账", icon: "💰" },
  { kind: "quote", label: "摘抄", icon: "📖" },
  { kind: "book", label: "读书笔记", icon: "📚" },
];

function blocksSummary(blocks: DiaryBlock[]): string {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const b of blocks) {
    if (!seen.has(b.kind)) { seen.add(b.kind); types.push(b.kind); }
  }
  const labels = types.map((k) => COMPONENT_LABELS[k] || k);
  if (labels.length === 0) return "空模板";
  if (labels.length <= 3) return labels.join(" + ");
  return labels.slice(0, 2).join(" + ") + ` +${labels.length - 2}`;
}

export default function TemplateLibrary() {
  const [mine, setMine] = useState<UserTemplate[]>([]);
  const [pub, setPub] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine" | "public">("mine");

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bName, setBName] = useState("");
  const [bIcon, setBIcon] = useState("📋");
  const [bDesc, setBDesc] = useState("");
  const [bKinds, setBKinds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listTemplates("mine"), listTemplates("public")]);
      setMine(m.templates);
      setPub(p.templates);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditingId(null);
    setBName(""); setBIcon("📋"); setBDesc(""); setBKinds([]);
    setShowBuilder(true);
  }

  function openEdit(t: UserTemplate) {
    setEditingId(t.id);
    setBName(t.name); setBIcon(t.icon); setBDesc(t.description || "");
    setBKinds([...new Set(t.blocks.map((b) => b.kind))]);
    setShowBuilder(true);
  }

  async function handleSave() {
    if (!bName.trim()) { alert("请输入模板名称"); return; }
    if (bKinds.length === 0) { alert("至少选一个组件"); return; }
    setSaving(true);
    try {
      const newBlocks: DiaryBlock[] = bKinds.map((kind) => {
        const base = { id: uid("b"), kind } as DiaryBlock;
        switch (kind) {
          case "heading": return { ...base, content: "标题", level: 2 };
          case "text": return { ...base, content: "" };
          case "divider": return { ...base, content: "" };
          case "checkbox": return { ...base, content: "待办事项", checked: false };
          case "number": return { ...base, content: "", label: "数值", unit: "", value: undefined };
          case "finance_item": return { ...base, content: "", direction: "expense", category: "", value: undefined };
          case "quote": return { ...base, content: "摘抄内容", pageNumber: undefined };
          case "book": return { ...base, content: "选择一本书", author: "", totalPages: 200, currentPage: 0, bookId: "" };
          default: return { ...base, content: "" };
        }
      });
      if (editingId) {
        await updateTemplate({ id: editingId, name: bName.trim(), icon: bIcon, description: bDesc.trim(), blocks: newBlocks });
      } else {
        await saveTemplate({ name: bName.trim(), icon: bIcon, description: bDesc.trim(), blocks: newBlocks });
      }
      setShowBuilder(false);
      await load();
    } catch (e: any) { alert("保存失败: " + (e?.message || e)); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`删除模板"${name}"？`)) return;
    await deleteTemplate(id); await load();
  }

  async function handleShare(t: UserTemplate) {
    const newVal = !t.is_public;
    if (newVal && !confirm(`确认共享？共享后所有人都能看到"${t.name}"`)) return;
    await shareTemplate(t.id, newVal); await load();
  }

  const list = tab === "mine" ? mine : pub;

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-paper-ink2 italic leading-relaxed px-1">
        🌿 模板是你写作习惯的容器 —— 把常用的标题、待办、记账组合存下来，下次写日记一键套用。
        喜欢的模板也可以共享出去，让更多人感受到你的节奏。
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-paper-surface rounded-xl border border-paper-line">
          <button onClick={() => setTab("mine")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "mine" ? "bg-white shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >👤 我的 ({mine.length})</button>
          <button onClick={() => setTab("public")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "public" ? "bg-white shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >🌐 共享 ({pub.length})</button>
        </div>
        {tab === "mine" && (
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition"
          ><Plus size={14} /> 新建</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-paper-ink3"><Loader2 className="animate-spin inline" /> 加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-paper-ink3 text-sm">
          {tab === "mine" ? "还没有自定义模板，点右上角「新建」开始吧" : "暂时还没有人共享模板"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((t) => {
            const desc = t.description?.trim() || blocksSummary(t.blocks);
            return (
            <div key={t.id} className="relative group">
              <div className={`w-full p-3 rounded-xl border-2 transition ${t.is_owner ? "border-paper-line bg-paper-card" : "border-paper-line/60 bg-paper-surface/50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{t.icon}</span>
                  <span className="font-medium text-sm text-paper-ink truncate">{t.name}</span>
                  {t.is_public && <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">🌐</span>}
                </div>
                <div className="text-[11px] text-paper-ink2 leading-snug">
                  {desc}
                  {!t.is_owner && t.author_name && <span className="text-paper-ink3"> · {t.author_name}</span>}
                </div>
              </div>
              {t.is_owner && (
                <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                  <button title="编辑" onClick={() => openEdit(t)}
                    className="w-6 h-6 rounded-full bg-paper-card border border-paper-line text-paper-ink2 hover:border-violet-300 hover:text-violet-500 flex items-center justify-center shadow"><Pencil size={10} /></button>
                  <button title={t.is_public ? "取消共享" : "共享"} onClick={() => handleShare(t)}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shadow ${t.is_public ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-paper-card border-paper-line text-paper-ink2 hover:border-emerald-300 hover:text-emerald-500"}`}><Share2 size={10} /></button>
                  <button title="删除" onClick={() => handleDelete(t.id, t.name)}
                    className="w-6 h-6 rounded-full bg-paper-card border border-paper-line text-paper-ink2 hover:border-red-200 hover:text-red-500 flex items-center justify-center shadow"><Trash2 size={10} /></button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => !saving && setShowBuilder(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md max-h-[85vh] bg-paper-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-paper-line">
              <h3 className="font-semibold text-paper-ink">{editingId ? "编辑模板" : "自定义模板"}</h3>
              <button onClick={() => setShowBuilder(false)} className="w-8 h-8 rounded-full hover:bg-paper-surface flex items-center justify-center text-paper-ink2">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-paper-ink3 mb-1 block">模板名称</label>
                <input value={bName} onChange={(e) => setBName(e.target.value)} placeholder="比如：每周复盘" maxLength={20}
                  className="w-full px-3 py-2 rounded-xl border border-paper-line bg-paper-surface text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200" />
              </div>

              <div>
                <label className="text-xs font-medium text-paper-ink3 mb-1 block">图标</label>
                <div className="flex flex-wrap gap-2">
                  {["📋","🎯","💼","🏃","📖","✈️","🧘","💡","🎨","🍱"].map((ic) => (
                    <button key={ic} onClick={() => setBIcon(ic)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition ${bIcon === ic ? "bg-violet-100 border-2 border-violet-400" : "bg-paper-surface border border-paper-line"}`}
                    >{ic}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-paper-ink3 mb-1 block">描述（显示在卡片下方，让别人一眼看懂这个模板是干嘛的）</label>
                <input value={bDesc} onChange={(e) => setBDesc(e.target.value)} placeholder="比如：每周复盘 · 3 件好事 + 3 件待改进" maxLength={40}
                  className="w-full px-3 py-2 rounded-xl border border-paper-line bg-paper-surface text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200" />
              </div>

              <div>
                <label className="text-xs font-medium text-paper-ink3 mb-2 block">选择组件（勾选后按顺序组合）</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_COMPONENTS.map((comp) => {
                    const checked = bKinds.includes(comp.kind);
                    return (
                      <button key={comp.kind} onClick={() => {
                        setBKinds((prev) => prev.includes(comp.kind) ? prev.filter((k) => k !== comp.kind) : [...prev, comp.kind]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition text-left ${checked ? "bg-violet-50 border-violet-400 text-violet-800" : "bg-paper-surface border-paper-line text-paper-ink"}`}
                    >
                      <span className="text-base">{comp.icon}</span>
                      <span>{comp.label}</span>
                      {checked && <span className="ml-auto text-violet-500">✓</span>}
                    </button>
                    );
                  })}
                </div>
              </div>

              {bKinds.length > 0 && (
                <div className="rounded-xl border border-paper-line bg-paper-surface/50 p-3">
                  <div className="text-[11px] text-paper-ink3 mb-2">📐 预览结构：</div>
                  <div className="space-y-1 text-[12px]">
                    {bKinds.map((k, i) => {
                      const comp = AVAILABLE_COMPONENTS.find((c) => c.kind === k);
                      return <div key={i} className="flex items-center gap-2 text-paper-ink2"><span className="text-paper-ink3">{i + 1}.</span><span>{comp?.icon} {comp?.label}</span></div>;
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-paper-line flex gap-3">
              <button onClick={() => setShowBuilder(false)}
                className="flex-1 py-2.5 rounded-xl border border-paper-line text-paper-ink2 hover:bg-paper-surface text-sm">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingId ? "更新" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
