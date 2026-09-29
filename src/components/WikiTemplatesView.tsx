import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { wikiListTemplates, wikiAddTemplate, wikiDeleteTemplate, type WikiTemplate } from "../api";

// ====== 范本库 — 全局化 v5，从 KnowledgeBase 挪到个人中心 ======
// UI 对齐 PaperLibrary：tab 切换 + 右上操作按钮
export default function WikiTemplatesView() {
  const [templates, setTemplates] = useState<{ official: WikiTemplate[]; mine: WikiTemplate[] }>({ official: [], mine: [] });
  const [tab, setTab] = useState<"mine" | "official">("mine");
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["📦 通用基础"]));
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await wikiListTemplates(); setTemplates(r); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function toggleCat(cat: string) {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // 官方范本按 category 分组 + 排序（沿用原来的分类折叠）
  const order = ['📦 通用基础','🎬 文艺消费','📚 学习学术','💊 健康医疗','🍳 美食烹饪','💰 财务投资','💼 工作项目','🤝 人际社交','🌱 个人成长','✈️ 旅行足迹','其他'];
  const grouped: Record<string, WikiTemplate[]> = {};
  for (const t of templates.official) {
    const cat = t.category || '📦 通用基础';
    (grouped[cat] ||= []).push(t);
  }
  const sortedCats = Object.keys(grouped).sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-4">
      {/* 温暖说明 */}
      <div className="text-[12px] text-paper-ink2 italic leading-relaxed px-1">
        📋 范本库 — 定义"AI 从资料里提取什么、怎么组织成实体页面"。
        把范本绑到知识库里的分类后，AI 汇入资料时就会按这个格式生成实体。
        范本是 <b>全局</b> 的，建一次所有知识库都能用。
      </div>

      {/* Tab 胶囊 + 右上操作按钮（和信纸一模一样） */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-paper-surface rounded-xl border border-paper-line">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "mine" ? "bg-paper-card shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >👤 我的 ({templates.mine.length})</button>
          <button
            onClick={() => setTab("official")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "official" ? "bg-paper-card shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >🎁 官方 ({templates.official.length})</button>
        </div>
        {tab === "mine" && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition"
          >
            <Plus size={14} />
            新建
          </button>
        )}
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-12 text-paper-ink3"><Loader2 className="animate-spin inline" /> 加载中...</div>
      )}

      {/* tab = 我的 */}
      {!loading && tab === "mine" && templates.mine.length === 0 && (
        <div className="text-center py-12 text-paper-ink3 text-sm">
          还没有自定义范本，点右上角「新建」开始吧
        </div>
      )}
      {!loading && tab === "mine" && templates.mine.length > 0 && (
        <div className="space-y-1.5">
          {templates.mine.map(t => (
            <TemplateCard key={t.id} t={t} expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onDelete={async () => {
                if (!confirm(`删除「${t.name}」？`)) return;
                await wikiDeleteTemplate(t.id); load();
              }} />
          ))}
        </div>
      )}

      {/* tab = 官方 — 按类别折叠 */}
      {!loading && tab === "official" && templates.official.length === 0 && (
        <div className="text-center py-12 text-paper-ink3 text-sm">暂无官方范本</div>
      )}
      {!loading && tab === "official" && templates.official.length > 0 && (
        <div>
          {sortedCats.map(cat => {
            const open = openCats.has(cat);
            return (
              <div key={cat} className="mb-2">
                <button onClick={() => toggleCat(cat)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-paper-surface text-left transition">
                  <span className={`text-xs text-paper-ink3 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="text-sm font-medium text-paper-ink flex-1">{cat}</span>
                  <span className="text-[10px] text-paper-ink3 bg-paper-line/40 px-1.5 py-0.5 rounded-full">{grouped[cat].length}</span>
                </button>
                {open && (
                  <div className="ml-5 mt-1 space-y-1 mb-2">
                    {grouped[cat].map(t => (
                      <TemplateCard key={t.id} t={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新建对话框 */}
      {showNew && (
        <TemplateEditor
          onSave={async (data) => {
            await wikiAddTemplate(data);
            setShowNew(false); load();
          }}
          onCancel={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

// ====== TemplateCard ======
function TemplateCard({ t, expanded, onToggle, onDelete }: {
  t: WikiTemplate; expanded: boolean; onToggle: () => void; onDelete?: () => void;
}) {
  return (
    <div className={`border rounded-md transition-all ${expanded ? 'border-paper-line bg-paper-card' : 'border-paper-line/50 bg-paper-card/60'}`}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-paper-line/20">
        <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-sm font-medium flex-1">{t.name}</span>
        {t.category && <span className="text-[10px] text-paper-ink2 bg-paper-line/50 px-1.5 py-0.5 rounded">{t.category}</span>}
        {t.kind && <span className="text-[10px] text-paper-ink2 bg-paper-line/50 px-1.5 py-0.5 rounded">{t.kind}</span>}
        {onDelete && (
          <span
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-5 h-5 rounded-full bg-red-500/10 hover:bg-red-500 flex items-center justify-center text-red-500 hover:text-white transition"
            title="删除"
          ><Trash2 size={10} /></span>
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

// ====== TemplateEditor（新建/编辑弹窗） ======
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
            <div className="text-[10px] text-paper-ink3 mt-0.5">用 {'{{变量}}'} 当占位符，AI 会自动填资料里的内容</div>
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
