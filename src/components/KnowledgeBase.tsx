/**
 * LLM Wiki 知识库组件 v4 — 多知识库 + 分类-模板 1:1
 * sub-tabs: [⚙️ 配置] [📜 资料] [🌐 知识库]
 */
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  wikiListKbs, wikiAddKb, wikiUpdateKb, wikiDeleteKb,
  wikiListCategories, wikiAddCategory, wikiUpdateCategory, wikiDeleteCategory,
  wikiListPages, wikiGetPage,
  wikiListTemplates, wikiAddTemplate, wikiDeleteTemplate, wikiGraph,
  wikiUpdatePage, wikiGenerateEntity,
} from "../api";
import type { WikiKB, WikiCategory, WikiPage, WikiLink, WikiTemplate, WikiGraphNode, WikiGraphEdge } from "../api";

type SubTab = "settings" | "templates" | "pages";

const SUB_TABS: { k: SubTab; label: string }[] = [
  { k: "settings", label: "⚙️ 配置" },
  { k: "templates", label: "📋 范本" },
  { k: "pages", label: "🌐 知识库" },
];

export default function KnowledgeBase({ minimal = false }: { minimal?: boolean }) {
  const nav = useNavigate();
  const [kbs, setKbs] = useState<WikiKB[]>([]);
  const [curKbId, setCurKbId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>(minimal ? "pages" : "settings");

  async function loadKbs() {
    const r = await wikiListKbs();
    setKbs(r.kbs);
    if (r.kbs.length > 0 && !curKbId) setCurKbId(r.kbs[0].id);
  }
  useEffect(() => { loadKbs(); }, []);

  async function createKb(title: string) {
    if (!title.trim()) return;
    const r = await wikiAddKb(title.trim());
    await loadKbs();
    setCurKbId(r.id);
  }

  async function deleteKb(id: string) {
    if (!confirm("确定删除此知识库？所有相关数据都会消失。")) return;
    await wikiDeleteKb(id);
    const remain = kbs.filter(k => k.id !== id);
    setKbs(remain);
    setCurKbId(remain[0]?.id || null);
  }

  const curKb = kbs.find(k => k.id === curKbId) || null;

  return (
    <section className={minimal ? "" : "bg-paper-card rounded-card shadow-card border border-paper-line/50 p-5"}>
      {/* minimal 模式 — 顶部说明 */}
      {minimal && (
        <div className="card p-3 mb-3 flex items-start gap-2">
          <span className="text-lg shrink-0">🌳</span>
          <div className="text-xs text-paper-ink2 leading-relaxed">
            <div className="font-medium text-paper-ink mb-1">知识库</div>
            <div>把零散的资料整理成相互关联的笔记 — AI 帮你分类、建链接、生成页面。</div>
            <div className="text-paper-ink3 mt-1">
              要新建知识库、添加资料或配置范本？→ <button onClick={() => nav("/profile")} className="text-paper-accent hover:underline font-medium">去「我的」→ 知识</button>
            </div>
          </div>
        </div>
      )}
      {!minimal && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">📖 我的知识库</h3>
        </div>
      )}

      {/* sub-tabs — minimal 模式下隐藏 */}
      {!minimal && (
        <div className="flex gap-1 mb-4 flex-nowrap overflow-x-auto">
          {SUB_TABS.map(t => (
            <button key={t.k} onClick={() => setSubTab(t.k)}
              className={`px-2.5 py-1.5 rounded-md text-xs transition whitespace-nowrap shrink-0 ${subTab === t.k ? "bg-paper-ink text-white font-medium" : "text-paper-ink2 hover:bg-paper-line/50"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-[200px]">
        {subTab === "settings" && (
          <SettingsTab
            kbs={kbs} curKbId={curKbId} onSelect={setCurKbId}
            onCreateKb={createKb} onDeleteKb={deleteKb} onKbsChanged={loadKbs}
          />
        )}
        {subTab === "templates" && curKb && (
          <TemplatesTab kb={curKb} />
        )}
        {subTab === "pages" && curKb && <PagesTab kbs={kbs} />}
        {subTab !== "settings" && !curKb && (
          <div className="text-center py-10 text-paper-ink3 text-sm">
            📭 还没有知识库{minimal ? " — 去「我的」→ 知识库 配置" : "，去「⚙️ 配置」新建一个吧"}
          </div>
        )}
      </div>
    </section>
  );
}

// ============== Settings ==============
function SettingsTab(props: {
  kbs: WikiKB[]; curKbId: string | null; onSelect: (id: string) => void;
  onCreateKb: (title: string) => void; onDeleteKb: (id: string) => void; onKbsChanged: () => void;
}) {
  const { kbs, curKbId, onSelect, onCreateKb, onDeleteKb, onKbsChanged } = props;
  const curKb = kbs.find(k => k.id === curKbId) || null;
  const [cats, setCats] = useState<WikiCategory[]>([]);
  const [templates, setTemplates] = useState<{ official: WikiTemplate[]; mine: WikiTemplate[] }>({ official: [], mine: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showNewKbDialog, setShowNewKbDialog] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function loadCats() { if (!curKb) return; const r = await wikiListCategories(curKb.id); setCats(r.categories); }
  async function loadTemplates() { if (!curKb) return; const r = await wikiListTemplates(curKb.id); setTemplates(r); }
  useEffect(() => { loadCats(); loadTemplates(); }, [curKb?.id]);

  async function saveTitle(newTitle: string) {
    if (!curKb) return;
    await wikiUpdateKb(curKb.id, newTitle);
    onKbsChanged();
    showToast("✅ 名称已保存");
  }

  async function addCat(cat: { name: string; page_format: string }) {
    if (!curKb) return;
    await wikiAddCategory(curKb.id, cat);
    setShowNew(false); loadCats();
    showToast("✅ 分类已保存");
  }
  async function updateCat(cat: { id?: string; name: string; page_format: string }) {
    if (!cat.id || !curKb) return;
    await wikiUpdateCategory(curKb.id, { id: cat.id, name: cat.name, page_format: cat.page_format });
    setEditingId(null); loadCats();
    showToast("✅ 分类已更新");
  }
  async function delCat(id: string) {
    if (!confirm("确定删除此分类？已生成的页面保留。")) return;
    if (!curKb) return;
    await wikiDeleteCategory(curKb.id, id); loadCats();
    showToast("🗑️ 分类已删除");
  }

  function handleCreateKb() {
    if (!newKbName.trim()) return;
    onCreateKb(newKbName.trim());
    setNewKbName(""); setShowNewKbDialog(false);
    showToast("✅ 知识库已创建");
  }

  // =========== UI ===========
  if (!curKb) {
    return (
      <div className="space-y-3">
        <h4 className="text-paper-ink2 text-xs font-medium uppercase tracking-wider">🗂️ 我的知识库</h4>
        {kbs.length > 0 && (
          <div className="space-y-1">
            {kbs.map(k => (
              <button key={k.id} onClick={() => onSelect(k.id)}
                className="w-full text-left px-3 py-2 rounded-md border border-paper-line bg-paper-card hover:bg-paper-line/30 text-sm">{k.title}</button>
            ))}
          </div>
        )}
        <div className="text-center text-paper-ink3 text-xs py-2">还没有知识库</div>
        <button onClick={() => setShowNewKbDialog(true)}
          className="w-full px-4 py-2 bg-paper-ink text-white rounded-md text-xs">+ 新建知识库</button>
        {toast && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-4 py-2 rounded shadow-lg z-50">{toast}</div>}
        {showNewKbDialog && (
          <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center" onClick={() => setShowNewKbDialog(false)}>
            <div className="bg-paper-card rounded-lg p-4 w-[300px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="font-medium text-sm mb-3">新建知识库</div>
              <input autoFocus value={newKbName} onChange={e => setNewKbName(e.target.value)} placeholder="输入知识库名称"
                onKeyDown={e => e.key === 'Enter' && handleCreateKb()}
                className="w-full px-3 py-2 rounded-md border border-paper-line text-sm" />
              <div className="flex gap-2 justify-end mt-3">
                <button onClick={() => { setShowNewKbDialog(false); setNewKbName(""); }} className="px-3 py-1 text-xs text-paper-ink2">取消</button>
                <button onClick={handleCreateKb} disabled={!newKbName.trim()} className="px-3 py-1 text-xs bg-paper-ink text-white rounded disabled:opacity-50">确定</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* KB 管理行 */}
      <div className="flex gap-3 items-start">
        <span className="text-xs text-paper-ink2 whitespace-nowrap pt-2.5">📂 知识库</span>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input autoFocus value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { saveTitle(editTitleValue); setEditingTitle(false); } }}
              onBlur={() => { saveTitle(editTitleValue); setEditingTitle(false); }}
              className="w-full px-3 py-2 rounded-md border border-paper-line bg-paper-card text-sm" />
          ) : (
            <select value={curKbId || ""} onChange={e => onSelect(e.target.value)}
              className="w-full px-3 py-2 bg-transparent text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-paper-accent/30">
              {kbs.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}
            </select>
          )}
        </div>
        {/* 按钮区：新建左侧全高，修改+删除右侧竖排等高 */}
        <div className="flex gap-2 items-center shrink-0">
          <button onClick={() => { setNewKbName(""); setShowNewKbDialog(true); }}
            className="px-3 py-2 bg-paper-ink text-white rounded-md text-xs whitespace-nowrap h-[34px]">+ 新建</button>
          <div className="flex flex-col gap-[3px] h-[34px]">
            <button onClick={() => { setEditTitleValue(curKb.title); setEditingTitle(true); }}
              className="px-2 py-0.5 text-xs text-paper-accent border border-paper-line rounded-md hover:bg-paper-line/30 flex-1 min-h-0">修改</button>
            <button onClick={() => onDeleteKb(curKb.id)}
              className="px-2 py-0.5 text-xs text-paper-ink2 border border-paper-line rounded-md hover:border-red-300 hover:text-red-500 flex-1 min-h-0">删除</button>
          </div>
        </div>
      </div>

      <hr className="border-paper-line/50" />

      {/* 分类列表 */}
      <div className="flex justify-between items-center">
        <h4 className="text-paper-ink2 text-xs font-medium uppercase tracking-wider">📁 分类（选范本自动带模板）</h4>
        <button onClick={() => setShowNew(true)} disabled={showNew}
          className="px-3 py-1 bg-paper-ink text-white rounded text-xs disabled:opacity-50">+ 新增分类</button>
      </div>

      {showNew && <CategoryEditor templates={templates} onSave={addCat} onCancel={() => setShowNew(false)} />}

      {cats.length === 0 && !showNew && (
        <div className="text-paper-ink3 text-xs text-center py-4">暂无分类，点「+ 新增分类」开始</div>
      )}

      <div className="space-y-2">
        {cats.map(c => editingId === c.id ? (
          <CategoryEditor key={c.id} templates={templates} cat={c} onSave={updateCat} onCancel={() => setEditingId(null)} />
        ) : (
          <div key={c.id} className="px-3 py-2 rounded-md border border-paper-line bg-paper-card">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium text-sm text-paper-ink">{c.name}</div>
                <pre className="text-paper-ink3 text-xs mt-1 whitespace-pre-wrap line-clamp-2 bg-paper-line/30 p-1 rounded font-mono">{c.page_format || '（未设模板）'}</pre>
              </div>
              <div className="flex gap-2 ml-2">
                <button onClick={() => setEditingId(c.id)} className="text-xs text-paper-ink2 hover:text-paper-ink whitespace-nowrap">编辑</button>
                <button onClick={() => delCat(c.id)} className="text-xs text-paper-ink2 hover:text-red-500 whitespace-nowrap">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-4 py-2 rounded shadow-lg z-50">{toast}</div>}

      {/* 新建知识库弹框 */}
      {showNewKbDialog && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center" onClick={() => setShowNewKbDialog(false)}>
          <div className="bg-paper-card rounded-lg p-4 w-[300px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="font-medium text-sm mb-3">新建知识库</div>
            <input autoFocus value={newKbName} onChange={e => setNewKbName(e.target.value)} placeholder="输入知识库名称"
              onKeyDown={e => e.key === 'Enter' && handleCreateKb()}
              className="w-full px-3 py-2 rounded-md border border-paper-line text-sm" />
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => { setShowNewKbDialog(false); setNewKbName(""); }} className="px-3 py-1 text-xs text-paper-ink2">取消</button>
              <button onClick={handleCreateKb} disabled={!newKbName.trim()} className="px-3 py-1 text-xs bg-paper-ink text-white rounded disabled:opacity-50">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryEditor({ templates, cat, onSave, onCancel }: {
  templates: { official: WikiTemplate[]; mine: WikiTemplate[] };
  cat?: WikiCategory;
  onSave: (c: { id?: string; name: string; page_format: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: cat?.name || '',
    page_format: cat?.page_format || '',
  });

  function applyTemplate(tpl: WikiTemplate) {
    setForm(f => ({ ...f, page_format: tpl.page_format }));
  }

  function submit() {
    if (!form.name) return;
    if (cat) onSave({ id: cat.id, ...form });
    else onSave({ ...form });
  }

  const allTpls = [...templates.official, ...templates.mine];

  return (
    <div className="border border-paper-line rounded-md p-3 bg-paper-card space-y-3">
      <div className="font-medium text-sm">{cat ? "编辑分类" : "新增分类"}</div>

      {/* ① 分类名称（第一个，先让用户填） */}
      <div>
        <label className="text-xs text-paper-ink2 block mb-0.5">📁 分类名称</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如 人物 / 事件 / 地点"
          className="w-full px-2 py-1.5 rounded border border-paper-line text-sm" />
      </div>

      {/* ② 套用范本（可选，选了自动填下面的页面格式） */}
      <div>
        <label className="text-xs text-paper-ink2 block mb-0.5">📋 套用范本（可跳过，下面自己写也行）</label>
        <select value="" onChange={e => { if (e.target.value) { const t = allTpls.find(t => t.id === e.target.value); if (t) applyTemplate(t); } e.target.value = ''; }}
          className="w-full px-2 py-1.5 rounded border border-paper-line text-sm">
          <option value="">— 不套用，从零开始 —</option>
          {templates.official.length > 0 && <optgroup label="🎁 官方范本">
            {templates.official.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>}
          {templates.mine.length > 0 && <optgroup label="📦 我的范本">
            {templates.mine.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>}
        </select>
      </div>

      {/* ③ 页面格式（左编辑 + 右预览） */}
      <div>
        <label className="text-xs text-paper-ink2 block mb-1">📄 页面格式（Markdown 模板，{'{{占位符}}'} AI 会自动填充）</label>
        <div className="grid grid-cols-2 gap-2">
          <textarea value={form.page_format} onChange={e => setForm({ ...form, page_format: e.target.value })} rows={8}
            placeholder={'# {{名称}}\n\n## 身份\n{{身份}}\n\n## 生平\n{{生平}}'}
            className="w-full px-2 py-1.5 rounded border border-paper-line text-[11px] font-mono resize-none leading-relaxed" />
          <div className="border border-paper-line rounded-md p-2 bg-paper-line/10 text-xs overflow-auto max-h-48">
            {form.page_format ? (
              <div className="prose prose-xs max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.page_format}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-paper-ink3 text-center py-4 text-[11px]">预览区<br/>（输入左边模板后在这里实时渲染）</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-paper-ink2">取消</button>
        <button onClick={submit} disabled={!form.name.trim()} className="px-3 py-1 text-xs bg-paper-ink text-white rounded disabled:opacity-50">保存</button>
      </div>
    </div>
  );
}

// ============== 范本库 Tab ==============
function TemplatesTab({ kb }: { kb: WikiKB }) {
  const [templates, setTemplates] = useState<{ official: WikiTemplate[]; mine: WikiTemplate[] }>({ official: [], mine: [] });
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await wikiListTemplates(kb.id); setTemplates(r); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [kb.id]);

  return (
    <div className="space-y-4 pb-14">
      {/* 新建按钮 */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-paper-ink3">📦 给这个知识库创建专属范本，分类可以直接引用</div>
        <button onClick={() => setShowNew(true)}
          className="px-3 py-1 bg-paper-ink text-white rounded text-xs">+ 新建范本</button>
      </div>

      {/* 官方范本 */}
      <div>
        <h4 className="text-xs text-paper-ink2 uppercase tracking-wider mb-2">🎁 官方范本（只读）</h4>
        {loading && <div className="text-xs text-paper-ink3 py-4 text-center">加载中...</div>}
        {!loading && templates.official.length === 0 && <div className="text-xs text-paper-ink3 py-4 text-center">暂无官方范本</div>}
        <div className="space-y-1.5">
          {templates.official.map(t => (
            <TemplateCard key={t.id} t={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} />
          ))}
        </div>
      </div>

      {/* 我的范本 */}
      <div>
        <h4 className="text-xs text-paper-ink2 uppercase tracking-wider mb-2">📦 我的范本（{templates.mine.length}）</h4>
        {!loading && templates.mine.length === 0 && (
          <div className="text-xs text-paper-ink3 py-4 text-center border border-dashed border-paper-line rounded-md">
            还没有自定义范本，点右上角「+ 新建范本」创建
          </div>
        )}
        <div className="space-y-1.5">
          {templates.mine.map(t => (
            <TemplateCard key={t.id} t={t} expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onDelete={async () => {
                if (!confirm(`删除「${t.name}」？`)) return;
                await wikiDeleteTemplate(kb.id, t.id); load();
              }} />
          ))}
        </div>
      </div>

      {/* 新建对话框 */}
      {showNew && (
        <TemplateEditor
          onSave={async (data) => {
            await wikiAddTemplate(kb.id, data);
            setShowNew(false); load();
          }}
          onCancel={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

function TemplateCard({ t, expanded, onToggle, onDelete }: {
  t: WikiTemplate; expanded: boolean; onToggle: () => void; onDelete?: () => void;
}) {
  return (
    <div className={`border rounded-md transition-all ${expanded ? 'border-paper-line bg-paper-card' : 'border-paper-line/50 bg-paper-card/60'}`}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-paper-line/20">
        <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-sm font-medium flex-1">{t.name}</span>
        {t.kind && <span className="text-[10px] text-paper-ink2 bg-paper-line/50 px-1.5 py-0.5 rounded">{t.kind}</span>}
        {onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-[10px] text-paper-ink3 hover:text-red-500 px-1.5">删除</button>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs border-t border-paper-line/50 pt-2">
          {t.description && <div><span className="text-paper-ink2">说明：</span>{t.description}</div>}
          {t.extract_hints && <div><span className="text-paper-ink2">提取提示：</span>{t.extract_hints}</div>}
          {t.page_format && (
            <details>
              <summary className="cursor-pointer text-paper-ink2 hover:underline">📄 页面格式模板</summary>
              <pre className="mt-1 p-2 bg-paper-line/20 rounded text-[11px] whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-auto">{t.page_format}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ onSave, onCancel, initial }: {
  onSave: (data: { name: string; description?: string; extract_hints?: string; page_format?: string }) => Promise<void>;
  onCancel: () => void;
  initial?: { name?: string; description?: string; extract_hints?: string; page_format?: string };
}) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [hints, setHints] = useState(initial?.extract_hints || "");
  const [fmt, setFmt] = useState(initial?.page_format || "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave({ name: name.trim(), description: desc.trim(), extract_hints: hints.trim(), page_format: fmt }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-paper-card rounded-lg p-4 w-full max-w-[440px] shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="font-medium text-sm mb-3">📋 {initial ? '编辑' : '新建'}范本</div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-paper-ink2 block mb-0.5">名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：人物"
              className="w-full px-2 py-1.5 rounded border border-paper-line text-sm" />
          </div>
          <div>
            <label className="text-xs text-paper-ink2 block mb-0.5">说明（给 AI 看的）</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="如：三国时期的历史人物"
              className="w-full px-2 py-1.5 rounded border border-paper-line text-sm" />
          </div>
          <div>
            <label className="text-xs text-paper-ink2 block mb-0.5">提取提示（告诉 AI 该提取什么）</label>
            <textarea value={hints} onChange={e => setHints(e.target.value)} rows={2} placeholder="如：姓名、字号、生平、主要事迹"
              className="w-full px-2 py-1.5 rounded border border-paper-line text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs text-paper-ink2 block mb-0.5">页面格式（Markdown 模板）</label>
            <textarea value={fmt} onChange={e => setFmt(e.target.value)} rows={6}
              placeholder={`# {{名称}}\n\n## 身份\n{{身份}}\n\n## 生平\n{{生平}}`}
              className="w-full px-2 py-1.5 rounded border border-paper-line text-[11px] font-mono resize-y" />
            <div className="text-[10px] text-paper-ink3 mt-0.5">用 {`{{变量}}`} 当占位符，AI 会自动填资料里的内容</div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-3 py-1 text-xs text-paper-ink2">取消</button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="px-3 py-1 text-xs bg-paper-ink text-white rounded disabled:opacity-50">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Pages（显示所有知识库） ==============
function PagesTab({ kbs }: { kbs: WikiKB[] }) {
  const [kbData, setKbData] = useState<{ kb: WikiKB; pages: WikiPage[]; categories: WikiCategory[] }[]>([]);
  const [detail, setDetail] = useState<{ kbId: string; page: WikiPage; outlinks: WikiLink[]; backlinks: WikiLink[] } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [graphData, setGraphData] = useState<Record<string, { nodes: WikiGraphNode[]; links: WikiGraphEdge[] }>>({});
  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // 新实体生成弹窗
  const [pendingEntities, setPendingEntities] = useState<string[]>([]);
  const [entityCats, setEntityCats] = useState<Record<string, string>>({}); // entity_name -> category_id
  const [entityGenerating, setEntityGenerating] = useState(false);

  // 从来源页面 content 里截取提到目标页面的上下文
  function getBacklinkContext(sourceTitle: string, targetTitle: string): string | null {
    let sourceContent = "";
    for (const kd of kbData) {
      const p = kd.pages.find(x => x.title === sourceTitle);
      if (p) { sourceContent = p.content; break; }
    }
    if (!sourceContent) return null;
    // 优先找 [[targetTitle]]，找不到再找纯文本 targetTitle
    let needle = `[[${targetTitle}]]`;
    let idx = sourceContent.indexOf(needle);
    if (idx === -1) {
      needle = targetTitle;
      idx = sourceContent.indexOf(needle);
    }
    if (idx === -1) return null;
    const start = Math.max(0, idx - 35);
    const end = Math.min(sourceContent.length, idx + needle.length + 35);
    let ctx = sourceContent.slice(start, end);
    if (start > 0) ctx = "..." + ctx;
    if (end < sourceContent.length) ctx = ctx + "...";
    ctx = ctx.replace(/^#+\s+/gm, "").replace(/[>*_`]/g, "").replace(/\n/g, " ").trim();
    return ctx || null;
  }

  async function refreshAll() {
    const results = await Promise.all(kbs.map(async kb => {
      try {
        const [p, c] = await Promise.all([wikiListPages(kb.id), wikiListCategories(kb.id)]);
        return { kb, pages: p.pages, categories: c.categories };
      } catch { return { kb, pages: [], categories: [] }; }
    }));
    setKbData(results);
  }

  async function refreshGraph() {
    const results: Record<string, { nodes: WikiGraphNode[]; links: WikiGraphEdge[] }> = {};
    for (const kb of kbs) {
      try {
        const r = await wikiGraph(kb.id);
        results[kb.id] = r;
      } catch { results[kb.id] = { nodes: [], links: [] }; }
    }
    setGraphData(results);
  }

  useEffect(() => { refreshAll(); }, [kbs.map(k => k.id).join(",")]);
  useEffect(() => { if (viewMode === "graph") refreshGraph(); }, [viewMode, kbs.map(k => k.id).join(",")]);

  async function openPage(kbId: string, pageId: string) {
    const r = await wikiGetPage(kbId, pageId);
    setDetail({ kbId, ...r });
  }

  // 监听小麦来源点击 → 打开指定页面
  useEffect(() => {
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { kbId: string; pageId: string };
      if (d?.kbId && d?.pageId) openPage(d.kbId, d.pageId);
    };
    window.addEventListener('kb-open-page', handler);
    return () => window.removeEventListener('kb-open-page', handler);
  }, []);

  const pageTitleMap = useMemo(() => {
    const m: Record<string, { kbId: string; id: string }> = {};
    for (const kd of kbData) for (const p of kd.pages) m[p.title] = { kbId: kd.kb.id, id: p.id };
    return m;
  }, [kbData]);

  function toggleExpand(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function renderMarkdown(content: string, _kbId: string) {
    const processed = content.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
      const target = pageTitleMap[title];
      if (target) return `[${title}](#page-${target.kbId}/${target.id})`;
      return `**${title}**`;
    });
    return (
      <div className="wiki-md text-sm text-paper-ink">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const m = (href || "").match(/^#page-([^/]+)\/(.+)$/);
              if (m) return <a className="text-blue-600 hover:underline cursor-pointer" onClick={() => openPage(m[1], m[2])}>{children}</a>;
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>;
            },
            h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 text-paper-ink">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2 text-paper-ink">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1 text-paper-ink">{children}</h3>,
            p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 my-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 my-1">{children}</ol>,
            li: ({ children }) => <li className="my-0.5">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-paper-ink">{children}</strong>,
            em: ({ children }) => <em>{children}</em>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-paper-line pl-3 my-1 text-paper-ink2 italic">{children}</blockquote>,
            code: ({ children }) => <code className="bg-paper-line/50 px-1 rounded text-xs font-mono">{children}</code>,
            hr: () => <hr className="my-3 border-paper-line" />,
          }}
        >{processed}</ReactMarkdown>
      </div>
    );
  }

  if (detail) {
    const kbCats = kbData.find(x => x.kb.id === detail!.kbId)?.categories || [];

    async function saveEdit() {
      setEditSaving(true);
      try {
        // 1. 更新页面
        await wikiUpdatePage(detail!.kbId, detail!.page.id, { content: editContent });
        // 2. 检测新 [[xxx]]
        const allTitles = new Set<string>();
        for (const kd of kbData) for (const p of kd.pages) allTitles.add(p.title);
        const found = Array.from(new Set((editContent.match(/\[\[([^\]]+)\]\]/g) || []).map(s => s.slice(2, -2))));
        const missing = found.filter(t => !allTitles.has(t));
        if (missing.length > 0) {
          setPendingEntities(missing);
          setEntityCats({});
        } else {
          // 没有新实体，直接刷新
          await openPage(detail!.kbId, detail!.page.id);
          refreshAll();
        }
        setEditing(false);
      } finally {
        setEditSaving(false);
      }
    }

    async function generatePending() {
      setEntityGenerating(true);
      try {
        const sourceText = editContent;
        for (const name of pendingEntities) {
          const catId = entityCats[name] || undefined;
          await wikiGenerateEntity(detail!.kbId, { entity_name: name, source_text: sourceText, category_id: catId });
        }
        await openPage(detail!.kbId, detail!.page.id);
        refreshAll();
        // 如果是图谱模式也刷新图谱
        if (viewMode === "graph") refreshGraph();
      } finally {
        setEntityGenerating(false);
        setPendingEntities([]);
      }
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { setDetail(null); setEditing(false); }} className="text-xs text-paper-ink2 hover:text-paper-ink">← 返回列表</button>
          {detail.page.is_system !== 1 && !editing && (
            <button onClick={() => { setEditing(true); setEditContent(detail!.page.content); }}
              className="text-xs text-paper-accent hover:underline">✏️ 编辑</button>
          )}
        </div>
        <div className="bg-paper-card rounded-md border border-paper-line p-4">
          <div className="mb-3">
            {detail.page.is_system === 1 && <span className="text-xs text-paper-ink2 mr-2">[系统模板]</span>}
            <h4 className="text-xl font-bold text-paper-ink inline">{detail.page.title}</h4>
          </div>
          {editing ? (
            <div className="space-y-2">
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                className="w-full h-80 text-sm font-mono border border-paper-line rounded-md p-2 focus:outline-none focus:border-paper-ink resize-y" />
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={editSaving}
                  className="px-3 py-1 text-xs bg-paper-ink text-white rounded hover:opacity-80 disabled:opacity-50">
                  {editSaving ? "保存中..." : "💾 保存"}
                </button>
                <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs border border-paper-line rounded text-paper-ink2 hover:bg-paper-line/30">取消</button>
                <span className="text-xs text-paper-ink3 self-center">提示：在 [[这里]] 写新实体名，保存后会自动帮你生成</span>
              </div>
            </div>
          ) : renderMarkdown(detail!.page.content, detail.kbId)}
        </div>

        {/* 新实体生成弹窗 */}
        {pendingEntities.length > 0 && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-paper-card rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-paper-ink mb-1">检测到 {pendingEntities.length} 个新实体</h3>
                <p className="text-xs text-paper-ink2">请选择每个实体的分类，AI 会按范本自动生成页面。</p>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {pendingEntities.map(name => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-paper-ink font-medium">[[{name}]]</span>
                    <select value={entityCats[name] || ""}
                      onChange={e => setEntityCats(prev => ({ ...prev, [name]: e.target.value }))}
                      className="text-xs border border-paper-line rounded px-2 py-1 bg-paper-card">
                      <option value="">不选（AI 自由生成）</option>
                      {kbCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setPendingEntities([])}
                  className="px-3 py-1.5 text-xs border border-paper-line rounded text-paper-ink2 hover:bg-paper-line/30">跳过（不生成）</button>
                <button onClick={generatePending} disabled={entityGenerating}
                  className="px-3 py-1.5 text-xs bg-paper-ink text-white rounded hover:opacity-80 disabled:opacity-50">
                  {entityGenerating ? "生成中..." : "✨ 批量生成"}
                </button>
              </div>
            </div>
          </div>
        )}

        {(detail.outlinks.length > 0 || detail.backlinks.length > 0) && (
          <div className="space-y-3 text-xs">
            {/* 反链 — 谁提到了我 + 上下文 */}
            {detail.backlinks.length > 0 && (
              <div>
                <h5 className="text-paper-ink2 uppercase tracking-wider mb-2">← 谁提到了我 ({detail.backlinks.length})</h5>
                <div className="space-y-2">
                  {detail.backlinks.map(l => {
                    const target = pageTitleMap[l.from_title];
                    const ctx = getBacklinkContext(l.from_title, detail!.page.title);
                    return (
                      <div key={l.from_title} className="bg-paper-card border border-paper-line rounded-md p-2">
                        <div className="text-blue-600 hover:underline cursor-pointer font-medium"
                          onClick={() => target && openPage(target.kbId, target.id)}>[[{l.from_title}]]</div>
                        {ctx && <div className="text-paper-ink3 mt-1 leading-relaxed">{ctx}</div>}
                        {!ctx && <div className="text-paper-ink3 mt-1 italic">（在原文中查找上下文...）</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 出链 — 我提到了谁 */}
            {detail.outlinks.length > 0 && (
              <div>
                <h5 className="text-paper-ink2 uppercase tracking-wider mb-1">→ 我提到了 ({detail.outlinks.length})</h5>
                <div className="flex flex-wrap gap-2">
                  {detail.outlinks.map(l => {
                    const target = pageTitleMap[l.to_title];
                    return <span key={l.to_title} className="text-blue-600 hover:underline cursor-pointer"
                      onClick={() => target && openPage(target.kbId, target.id)}>[[{l.to_title}]]</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 列表/图谱 toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-paper-ink2 text-xs font-medium uppercase tracking-wider">知识图谱</h4>
        <div className="flex gap-1 bg-paper-line/30 rounded-md p-0.5">
          <button onClick={() => setViewMode("list")}
            className={`px-2.5 py-0.5 rounded text-xs transition ${viewMode === "list" ? "bg-paper-card text-paper-ink font-medium shadow-sm" : "text-paper-ink2"}`}>
            📋 列表
          </button>
          <button onClick={() => setViewMode("graph")}
            className={`px-2.5 py-0.5 rounded text-xs transition ${viewMode === "graph" ? "bg-paper-card text-paper-ink font-medium shadow-sm" : "text-paper-ink2"}`}>
            🕸️ 图谱
          </button>
        </div>
      </div>

      {kbData.length === 0 && <div className="text-center py-8 text-paper-ink3 text-sm">📭 还没有知识库</div>}

      {viewMode === "graph" && kbs.map(kb => {
        const g = graphData[kb.id];
        if (!g || (g.nodes.length === 0)) return null;
        return (
          <div key={kb.id} className="border border-paper-line rounded-md bg-paper-card p-3">
            <h3 className="text-sm font-bold text-paper-ink mb-2">🌐 {kb.title} <span className="text-xs text-paper-ink3 font-normal">({g.nodes.length} 页 · {g.links.length} 链接)</span></h3>
            <WikiForceGraph
              nodes={g.nodes}
              edges={g.links}
              onNodeClick={(title) => {
                const tm = pageTitleMap[title];
                if (tm) openPage(tm.kbId, tm.id);
              }}
            />
          </div>
        );
      })}

      {viewMode === "graph" && Object.values(graphData).every(g => !g || g.nodes.length === 0) && kbData.length > 0 && (
        <div className="text-center py-8 text-paper-ink3 text-sm">
          🕸️ 还没有页面 — 去「📜 资料」汇入门资料让 AI 自动生成页面
        </div>
      )}

      {viewMode === "list" && kbData.map(({ kb, pages, categories }) => {
        const grouped: Record<string, WikiPage[]> = {};
        const noCat: WikiPage[] = [];
        for (const c of categories) grouped[c.id] = [];
        for (const p of pages) {
          if (p.category_id && grouped[p.category_id]) grouped[p.category_id].push(p);
          else noCat.push(p);
        }
        const totalPages = pages.length;

        return (
          <div key={kb.id} className="border border-paper-line rounded-md bg-paper-card p-3">
            <h3 className="text-sm font-bold text-paper-ink mb-2">🌐 {kb.title} <span className="text-xs text-paper-ink3 font-normal">({totalPages} 页)</span></h3>

            {categories.length === 0 && noCat.length === 0 && (
              <div className="text-xs text-paper-ink3">分类为空 — 去「⚙️ 配置」建分类，或先汇入资料让 AI 自动分类</div>
            )}

            {categories.map(c => {
              const catPages = grouped[c.id] || [];
              const key = `${kb.id}/${c.id}`;
              const isOpen = expanded[key] !== false;
              return (
                <div key={c.id} className="mb-2">
                  <div className="flex items-center text-xs text-paper-ink2 cursor-pointer py-1 select-none" onClick={() => toggleExpand(key)}>
                    <span className="mr-1">{isOpen ? '▼' : '▶'}</span>
                    <span className="font-medium">📁 {c.name}</span>
                    <span className="ml-1 text-paper-ink3">({catPages.length})</span>
                  </div>
                  {isOpen && catPages.length > 0 && (
                    <div className="pl-4 space-y-0.5">
                      {catPages.map(p => (
                        <div key={p.id} className="text-sm text-paper-ink hover:text-blue-600 hover:underline cursor-pointer py-0.5"
                          onClick={() => openPage(kb.id, p.id)}>
                          {p.title}
                          {p.is_system === 1 && <span className="text-xs text-paper-ink3 ml-1">[模板]</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && catPages.length === 0 && (
                    <div className="pl-4 text-xs text-paper-ink3 italic">（空）</div>
                  )}
                </div>
              );
            })}

            {noCat.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center text-xs text-paper-ink2 cursor-pointer py-1 select-none" onClick={() => toggleExpand(`${kb.id}/uncat`)}>
                  <span className="mr-1">{expanded[`${kb.id}/uncat`] !== false ? '▼' : '▶'}</span>
                  <span className="font-medium">未分类</span>
                  <span className="ml-1 text-paper-ink3">({noCat.length})</span>
                </div>
                {expanded[`${kb.id}/uncat`] !== false && (
                  <div className="pl-4 space-y-0.5">
                    {noCat.map(p => (
                      <div key={p.id} className="text-sm text-paper-ink hover:text-blue-600 hover:underline cursor-pointer py-0.5"
                        onClick={() => openPage(kb.id, p.id)}>{p.title}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============== 力导向图谱（零依赖） ==============
interface SimNode {
  id: string; title: string; category: string | null; is_system: boolean;
  x: number; y: number; vx: number; vy: number;
}
interface SimLink { source: string; target: string; }

// 简易力导向：斥力 + 弹簧 + 中心力
function runSimulation(
  nodes: SimNode[],
  links: SimLink[],
  width: number,
  height: number,
  iterations: number = 120
) {
  const nodeMap = new Map<string, SimNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // 构建邻接（便于中心力按连接数加权）
  const adj = new Map<string, Set<string>>();
  nodes.forEach(n => adj.set(n.id, new Set()));
  links.forEach(l => { adj.get(l.source)?.add(l.target); adj.get(l.target)?.add(l.source); });

  const cx = width / 2;
  const cy = height / 2;
  const idealDist = Math.min(width, height) / Math.max(1, Math.sqrt(nodes.length)) * 2.5;
  const repulsion = 8000;
  const springK = 0.008;
  const centerK = 0.02;

  let temp = 1.0;
  const dampen = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    // 斥力（反平方律）
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; dist2 = dx * dx + dy * dy; }
        const dist = Math.sqrt(dist2);
        const f = repulsion / dist2;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    // 弹簧力（连线拉近/推远）
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const diff = dist - idealDist;
      const fx = (dx / dist) * diff * springK;
      const fy = (dy / dist) * diff * springK;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // 中心力（防止节点飘太远）
    for (const n of nodes) {
      n.vx += (cx - n.x) * centerK;
      n.vy += (cy - n.y) * centerK;
    }

    // 速度衰减 + 温度缩放
    for (const n of nodes) {
      n.vx *= dampen;
      n.vy *= dampen;
      // 限制最大步长
      const maxV = 10 * temp;
      const v = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (v > maxV) { n.vx = (n.vx / v) * maxV; n.vy = (n.vy / v) * maxV; }
      n.x += n.vx;
      n.y += n.vy;
      // 边界软约束
      const pad = 30;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }

    temp *= 0.99;
  }
}

// 分类颜色（给不同分类不同色的节点）
const CAT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4",
  "#8b5cf6", "#ef4444", "#84cc16", "#f97316", "#14b8a6",
];

function WikiForceGraph({
  nodes, edges, onNodeClick,
}: {
  nodes: WikiGraphNode[]; edges: WikiGraphEdge[];
  onNodeClick: (title: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const [renderNodes, setRenderNodes] = useState<SimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const dragState = useRef<{ nodeId: string | null; startX: number; startY: number; isPanning: boolean }>(
    { nodeId: null, startX: 0, startY: 0, isPanning: false }
  );

  // 颜色映射
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    nodes.forEach(n => {
      if (n.category && !map.has(n.category)) {
        map.set(n.category, CAT_COLORS[i % CAT_COLORS.length]);
        i++;
      }
    });
    return map;
  }, [nodes]);

  // 邻接 set（用于高亮选中节点的邻居）
  const neighborsSet = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const s = new Set<string>([selectedId]);
    edges.forEach(e => {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    });
    return s;
  }, [selectedId, edges]);

  // 初始化布局 + 跑模拟
  useEffect(() => {
    const W = 360, H = 320;
    const simNodes: SimNode[] = nodes.map((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const r = 80 + Math.random() * 60;
      return {
        id: n.title, title: n.title, category: n.category, is_system: n.is_system,
        x: W / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 10,
        y: H / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0,
      };
    });
    simNodesRef.current = simNodes;

    // 分两步：先粗跑，再动画收敛
    runSimulation(simNodes, edges, W, H, 60);
    setRenderNodes([...simNodes]);

    // 再开个短暂的 requestAnimationFrame 做平滑收尾
    let rafId: number;
    let frames = 0;
    const tick = () => {
      runSimulation(simNodes, edges, W, H, 10);
      setRenderNodes([...simNodes]);
      frames++;
      if (frames < 12) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [nodes, edges]);

  const onPointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { nodeId, startX: e.clientX, startY: e.clientY, isPanning: false };
    // 把拖拽节点初始速度清零（并移到最后，让它不被其他节点挤走）
    const n = simNodesRef.current.find(x => x.id === nodeId);
    if (n) { n.vx = 0; n.vy = 0; }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (ds.nodeId) {
      const n = simNodesRef.current.find(x => x.id === ds.nodeId);
      if (n) {
        // 位置直接跟随（考虑缩放）
        const dx = (e.clientX - ds.startX) / transform.k;
        const dy = (e.clientY - ds.startY) / transform.k;
        n.x += dx; n.y += dy;
        ds.startX = e.clientX; ds.startY = e.clientY;
        setRenderNodes([...simNodesRef.current]);
      }
    } else if (!ds.nodeId && ds.isPanning) {
      setTransform(t => ({ ...t, x: t.x + (e.clientX - ds.startX), y: t.y + (e.clientY - ds.startY) }));
      ds.startX = e.clientX; ds.startY = e.clientY;
    }
  }, [transform.k]);

  const onPointerUp = useCallback(() => {
    dragState.current.nodeId = null;
    dragState.current.isPanning = false;
  }, []);

  const onSvgPointerDown = useCallback((e: React.PointerEvent) => {
    // 点空白区域开始平移
    if (e.target === e.currentTarget || (e.target as Element).tagName === "line" || (e.target as Element).tagName === "rect") {
      dragState.current.isPanning = true;
      dragState.current.startX = e.clientX; dragState.current.startY = e.clientY;
      setSelectedId(null);
    }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform(t => {
      const newK = Math.max(0.3, Math.min(3, t.k * factor));
      const kRatio = newK / t.k;
      return { k: newK, x: mx - (mx - t.x) * kRatio, y: my - (my - t.y) * kRatio };
    });
  }, []);

  // 连接数（用于节点大小）
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach(n => m.set(n.title, 0));
    edges.forEach(e => { m.set(e.source, (m.get(e.source) || 0) + 1); m.set(e.target, (m.get(e.target) || 0) + 1); });
    return m;
  }, [nodes, edges]);

  const W = 360, H = 320;

  return (
    <div className="relative bg-[#faf6ef]/50 rounded-md overflow-hidden border border-paper-line/40" style={{ height: 320 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        className="cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        {/* 背景网格 */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.6" fill="#e7ddd0" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* 连线 */}
          {edges.map((e, i) => {
            const a = renderNodes.find(n => n.id === e.source);
            const b = renderNodes.find(n => n.id === e.target);
            if (!a || !b) return null;
            const dim = selectedId && !neighborsSet.has(e.source) && !neighborsSet.has(e.target);
            return (
              <line key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={selectedId ? (dim ? "#e0d9cd" : "#c4b9a5") : "#d4cabb"}
                strokeWidth={selectedId && !dim ? 1.6 : 1}
                strokeOpacity={dim ? 0.3 : 0.7}
              />
            );
          })}

          {/* 节点 */}
          {renderNodes.map(n => {
            const deg = degreeMap.get(n.id) || 0;
            const r = n.is_system ? 5 : Math.max(4, 5 + deg * 0.6);
            const catColor = n.category ? (colorMap.get(n.category) || "#7c73e6") : "#7c73e6";
            const selected = selectedId === n.id;
            const dim = selectedId && !neighborsSet.has(n.id);
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                style={{ cursor: "pointer", opacity: dim ? 0.2 : 1 }}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                onClick={(e) => { e.stopPropagation(); setSelectedId(prev => prev === n.id ? null : n.id); onNodeClick(n.id); }}
              >
                <circle r={selected ? r + 2.5 : r}
                  fill={catColor}
                  stroke={selected ? "#1e1b4b" : "white"}
                  strokeWidth={selected ? 2 : 1.5}
                  style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}
                />
                <text
                  textAnchor="middle"
                  y={r + 11}
                  fontSize={10}
                  fill={selected ? "#1e1b4b" : "#4a4035"}
                  fontWeight={selected ? 600 : 400}
                  style={{ pointerEvents: "none", fontFamily: "system-ui, sans-serif" }}
                >
                  {n.title.length > 10 ? n.title.slice(0, 9) + "…" : n.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* 图例：分类颜色 */}
      {colorMap.size > 0 && (
        <div className="absolute bottom-1 left-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-paper-ink2 bg-paper-card/80 rounded px-2 py-1">
          {Array.from(colorMap.entries()).map(([cat, color]) => (
            <span key={cat} className="flex items-center gap-0.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {cat}
            </span>
          ))}
        </div>
      )}
      {/* 缩放提示 */}
      <div className="absolute bottom-1 right-2 text-[10px] text-paper-ink3 bg-paper-card/70 rounded px-1.5 py-0.5">
        滚轮缩放 · 拖节点 · 点空白平移
      </div>
    </div>
  );
}


