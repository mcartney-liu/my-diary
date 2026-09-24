/**
 * 全局资料面板 — 不绑定某个 KB
 * 支持 KB 标签筛选、添加文本/上传文件、批量汇入到任意 KB
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Square } from "lucide-react";
import {
  wikiGlobalListSources,
  wikiGlobalAddSource,
  wikiGlobalDeleteSource,
  wikiUpdateSourceTags,
  wikiIngestAll,
  wikiListKbs,
} from "../api";
import type { WikiSource, WikiKB } from "../api";

export default function SourcesPanel() {
  const nav = useNavigate();
  const [kbs, setKbs] = useState<WikiKB[]>([]);
  const [sources, setSources] = useState<WikiSource[]>([]);
  const [kbFilter, setKbFilter] = useState<string>(""); // 空 = 全部
  const [loading, setLoading] = useState(false);

  // 添加文本
  const [newText, setNewText] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]); // 选中的 KB id 数组
  const [adding, setAdding] = useState(false);

  // 结果提示
  const [result, setResult] = useState<{
    ok: boolean;
    summary?: string;
    ingested?: number;
    created?: number;
    updated?: number;
    links?: number;
    error?: string;
  } | null>(null);

  // 选择模式
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 展开预览
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 改标签弹窗
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagEditValues, setTagEditValues] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);

  // 批量汇入
  const [ingestTargetKb, setIngestTargetKb] = useState<string>("");
  const [ingesting, setIngesting] = useState(false);

  // 删除 loading
  const [deleting, setDeleting] = useState(false);

  // ===== 初始化 & 刷新 =====
  async function refresh() {
    setLoading(true);
    try {
      const tag = kbFilter || undefined;
      const r = await wikiGlobalListSources(tag);
      setSources(r.sources);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "加载资料失败" });
    } finally {
      setLoading(false);
    }
  }

  async function loadKbs() {
    try {
      const r = await wikiListKbs();
      setKbs(r.kbs);
    } catch {}
  }

  useEffect(() => {
    loadKbs();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // kbFilter 变化 → 刷新
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbFilter]);

  // ===== 工具函数 =====
  // WikiSource 的 tags 字段可能是 JSON 字符串或 null
  function parseTags(raw?: string | null): string[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x: any) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  function toggleTagSelection(kbId: string) {
    setNewTags(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return Array.from(next);
    });
  }

  function toggleTagEdit(kbId: string) {
    setTagEditValues(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return Array.from(next);
    });
  }

  // ===== 添加文本 =====
  async function addOnly() {
    if (!newText.trim()) return;
    setAdding(true);
    setResult(null);
    try {
      await wikiGlobalAddSource({
        text: newText,
        title: newTitle.trim() || undefined,
        kind: "text",
        tags: newTags.length > 0 ? newTags : [],
      });
      setNewText("");
      setNewTitle("");
      setNewTags([]);
      setResult({ ok: true, summary: "✅ 已添加资料" });
      refresh();
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "添加失败" });
    } finally {
      setAdding(false);
    }
  }

  // ===== 上传文件 =====
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    try {
      const text = await file.text();
      await wikiGlobalAddSource({
        title: newTitle.trim() || file.name.replace(/\.[^.]+$/, ""),
        text,
        kind: "text",
        tags: newTags.length > 0 ? newTags : [],
      });
      setNewTitle("");
      setNewTags([]);
      setResult({ ok: true, summary: `📎 已上传「${file.name}」（${text.length} 字）` });
      refresh();
    } catch (err: any) {
      setResult({ ok: false, error: err.message || "上传失败" });
    }
    e.target.value = "";
  }

  // ===== 删除单条 =====
  async function deleteOne(id: string) {
    if (!confirm("删除这份资料？")) return;
    try {
      await wikiGlobalDeleteSource(id);
      setResult({ ok: true, summary: "🗑️ 已删除" });
      refresh();
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "删除失败" });
    }
  }

  // ===== 批量删除 =====
  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`确定删除 ${ids.length} 份资料？`)) return;
    setDeleting(true);
    setResult(null);
    try {
      for (const id of ids) {
        await wikiGlobalDeleteSource(id).catch(() => {});
      }
      setResult({ ok: true, summary: `🗑️ 已删除 ${ids.length} 份资料` });
      exitSelectMode();
      refresh();
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "未知错误" });
    } finally {
      setDeleting(false);
    }
  }

  // ===== 改标签 =====
  function openTagEditor(source: WikiSource) {
    const tags = parseTags(source.tags);
    setEditingTagsFor(source.id);
    setTagEditValues(tags);
  }

  async function saveTags() {
    if (!editingTagsFor) return;
    setTagSaving(true);
    try {
      await wikiUpdateSourceTags(editingTagsFor, tagEditValues);
      setResult({ ok: true, summary: "🏷️ 标签已更新" });
      setEditingTagsFor(null);
      refresh();
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "保存失败" });
    } finally {
      setTagSaving(false);
    }
  }

  // ===== 选择模式 =====
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selected.size === sources.length) setSelected(new Set());
    else setSelected(new Set(sources.map(s => s.id)));
  }

  // ===== 批量汇入 =====
  async function ingestSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!ingestTargetKb) {
      alert("请先选择目标知识库");
      return;
    }
    setIngesting(true);
    setResult(null);
    try {
      const r = await wikiIngestAll(ingestTargetKb, ids);
      if (!r.ok) throw new Error(r.message || "汇入失败");
      setResult({
        ok: true,
        ingested: r.ingested_count,
        created: r.created,
        updated: r.updated,
        links: r.links_added,
      });
      exitSelectMode();
      refresh();
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "未知错误" });
    } finally {
      setIngesting(false);
    }
  }

  // ===== 状态分组 =====
  const pending = sources.filter(s => !s.ingested);
  const done = sources.filter(s => !!s.ingested);

  // ===== 渲染 =====
  return (
    <div className="min-h-screen bg-paper-bg pb-28">
      {/* 顶部 header */}
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-[#faf6ef]/85 border-b border-paper-line/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
          >
            ← 返回
          </button>
          <h1 className="text-paper-ink font-semibold text-lg tracking-wide flex-1">📎 资料库</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* KB 筛选 + 添加按钮 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-4 space-y-3">
          <div className="flex gap-2 items-center">
            <span className="text-xs text-paper-ink2 whitespace-nowrap shrink-0">🏷️ 筛选：</span>
            <select
              value={kbFilter}
              onChange={e => setKbFilter(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-paper-line bg-paper-card text-sm"
            >
              <option value="">全部资料</option>
              {kbs.map(k => (
                <option key={k.id} value={k.id}>{k.title}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 添加文本区 */}
        <section className="bg-paper-card rounded-card shadow-card border border-paper-line/50 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="标题（可选）"
              className="flex-1 px-2 py-1.5 rounded border border-paper-line bg-paper-card text-sm"
            />
          </div>
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="粘贴资料文本..."
            rows={3}
            className="w-full px-2 py-1.5 rounded border border-paper-line bg-paper-card text-sm resize-none"
          />
          {/* 打 KB 标签 */}
          {kbs.length > 0 && (
            <div>
              <div className="text-xs text-paper-ink2 mb-1">🏷️ 打标签（可选，多选 KB）</div>
              <div className="flex flex-wrap gap-1.5">
                {kbs.map(kb => {
                  const active = newTags.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      onClick={() => toggleTagSelection(kb.id)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                        active
                          ? "bg-paper-accent/15 border-paper-accent text-paper-ink"
                          : "bg-paper-card border-paper-line text-paper-ink2 hover:border-paper-accent/50"
                      }`}
                    >{kb.title}</button>
                  );
                })}
                {newTags.length === 0 && <span className="text-[11px] text-paper-ink3">不打标签也能加，随时可以改</span>}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end items-center">
            <label className="px-3 py-1.5 text-xs border border-paper-line text-paper-ink rounded cursor-pointer hover:bg-paper-line/20 flex items-center gap-1">
              📎 上传文件
              <input
                type="file"
                accept=".txt,.md,.csv,.json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <button
              onClick={addOnly}
              disabled={adding || !newText.trim()}
              className="px-4 py-1.5 text-xs bg-paper-ink text-white rounded disabled:opacity-50"
            >
              {adding ? "保存中..." : "➕ 添加资料"}
            </button>
          </div>
        </section>

        {/* 结果提示 */}
        {result && (
          <div
            className={`rounded-md px-3 py-2.5 text-sm border ${
              result.ok
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {result.ok ? (
              result.summary ? (
                <div>{result.summary}</div>
              ) : (
                <div>
                  <div className="font-medium mb-1">✅ 汇入完成</div>
                  <div className="flex gap-4 text-xs flex-wrap">
                    {result.ingested != null && <span>📥 处理 {result.ingested} 份</span>}
                    {result.created != null && <span className="text-green-700">🆕 新建 {result.created} 页</span>}
                    {result.updated != null && <span className="text-blue-700">♻️ 更新 {result.updated} 页</span>}
                    {result.links != null && <span>🔗 {result.links} 条链接</span>}
                  </div>
                </div>
              )
            ) : (
              <div>❌ {result.error || "操作失败"}</div>
            )}
          </div>
        )}

        {/* 待汇入列表 */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center mb-2">
              <h4 className="text-xs text-paper-ink2 uppercase tracking-wider">📨 待汇入 ({pending.length})</h4>
              {selectMode && <span className="text-xs text-paper-ink2 ml-auto">已选 {selected.size}</span>}
              {!selectMode && pending.length > 0 && (
                <button onClick={() => setSelectMode(true)} className="text-xs text-paper-accent hover:underline ml-auto">选择</button>
              )}
              {selectMode && (
                <button onClick={exitSelectMode} className="text-xs text-paper-ink2 hover:underline ml-auto">取消</button>
              )}
            </div>
            <div className="space-y-1">
              {pending.map(s => renderSourceItem(s))}
            </div>
          </section>
        )}

        {/* 空状态 */}
        {loading && (
          <div className="text-center py-10 text-paper-ink3 text-sm">加载中...</div>
        )}
        {!loading && sources.length === 0 && (
          <div className="text-center py-12 text-paper-ink3 text-sm border border-dashed border-paper-line rounded-xl">
            📭 还没有资料 — 在上面粘贴文本点「➕ 添加资料」或「📎 上传文件」
          </div>
        )}

        {/* 已汇入列表 */}
        {done.length > 0 && (
          <section>
            <h4 className="text-xs text-paper-ink2 uppercase tracking-wider mb-2">✅ 已汇入 ({done.length})</h4>
            <div className="space-y-1">
              {done.map(s => renderSourceItem(s, true))}
            </div>
          </section>
        )}
      </main>

      {/* 底部批量汇入/选择栏 */}
      {selectMode && sources.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-paper-line bg-[#faf6ef]/95 backdrop-blur">
          <div className="max-w-3xl mx-auto flex flex-col gap-2 px-4 py-3">
            {/* 目标 KB + 汇入按钮 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-paper-ink2 shrink-0">📂 目标：</span>
              <select
                value={ingestTargetKb}
                onChange={e => setIngestTargetKb(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded border border-paper-line bg-paper-card text-xs"
              >
                <option value="">选一个知识库...</option>
                {kbs.map(k => (
                  <option key={k.id} value={k.id}>{k.title}</option>
                ))}
              </select>
            </div>
            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="text-xs text-paper-accent hover:underline">
                {selected.size === sources.length ? "取消全选" : "全选"}
              </button>
              <span className="text-xs text-paper-ink3">{selected.size}</span>
              <div className="flex-1" />
              <button
                onClick={ingestSelected}
                disabled={ingesting || selected.size === 0 || !ingestTargetKb}
                className="px-3 py-1.5 rounded-md bg-paper-ink text-white text-xs disabled:opacity-50 flex items-center gap-1"
              >
                {ingesting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    AI整理中...
                  </>
                ) : (
                  <>📥 汇入 {selected.size || ""}</>
                )}
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting || selected.size === 0}
                className="px-3 py-1.5 rounded-md border border-red-200 text-red-600 text-xs hover:bg-red-50 disabled:opacity-50"
              >
                🗑️ 删除 {selected.size || ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 改标签弹窗 */}
      {editingTagsFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditingTagsFor(null)}>
          <div className="bg-paper-card rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-paper-ink">🏷️ 修改标签</h3>
            {kbs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {kbs.map(kb => {
                  const active = tagEditValues.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      onClick={() => toggleTagEdit(kb.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "bg-paper-accent/15 border-paper-accent text-paper-ink font-medium"
                          : "bg-paper-card border-paper-line text-paper-ink2 hover:border-paper-accent/50"
                      }`}
                    >{kb.title}</button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-paper-ink3">还没有知识库 — 去「我的 → 知识」新建一个</div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingTagsFor(null)}
                className="px-3 py-1.5 text-xs text-paper-ink2"
              >取消</button>
              <button
                onClick={saveTags}
                disabled={tagSaving}
                className="px-3 py-1.5 text-xs bg-paper-ink text-white rounded disabled:opacity-50"
              >
                {tagSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ===== 单条资料渲染 =====
  function renderSourceItem(s: WikiSource, isDone = false) {
    const checked = selected.has(s.id);
    const expanded = expandedId === s.id;
    const tags = parseTags(s.tags);
    const kbTag = s.kb_id ? kbs.find(k => k.id === s.kb_id) : null;

    return (
      <div
        key={s.id}
        className={`px-3 py-2 rounded-md border ${
          checked ? "border-paper-accent bg-paper-accent/10" : isDone ? "border-paper-line/50 bg-paper-card/50" : "border-paper-line bg-paper-card"
        }`}
      >
        <div className="flex items-start gap-2">
          {/* 选择框 */}
          {selectMode && (
            <button
              onClick={() => toggleSelect(s.id)}
              className="shrink-0 text-paper-accent active:scale-90 mt-0.5"
            >
              {checked ? <CheckSquare size={20} /> : <Square size={20} className="text-paper-ink3" />}
            </button>
          )}

          {/* 主体 */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => setExpandedId(expanded ? null : s.id)}
          >
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`text-xs transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
              <span className="font-medium text-sm">
                {s.title || (s.kind === "diary" ? "日记" : "文本")}
              </span>
              <span className="text-[10px] text-paper-ink3">[{s.kind}]</span>

              {/* 状态 */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                isDone ? "bg-green-100 text-green-700" : "bg-paper-surface text-amber-700"
              }`}>
                {isDone ? "已汇入" : "待汇入"}
              </span>

              {/* KB 标签（tags 数组里的 + 原来的 kb_id） */}
              {tags.map(tid => {
                const kb = kbs.find(k => k.id === tid);
                return (
                  <span key={tid} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                    🏷️ {kb ? kb.title : tid}
                  </span>
                );
              })}
              {!tags.length && kbTag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  📂 {kbTag.title}
                </span>
              )}

              <span className="text-xs text-paper-ink3 ml-auto">{(s.raw_text || "").length} 字</span>
            </div>

            {/* 预览 / 全文 */}
            {!expanded && (s.raw_text || "").length > 50 && (
              <p className="text-xs text-paper-ink3 mt-1 line-clamp-2">
                {s.raw_text.slice(0, 80)}...
              </p>
            )}
            {expanded && (
              <div className="mt-2 text-xs text-paper-ink2 bg-paper-line/10 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap leading-relaxed">
                {s.raw_text}
              </div>
            )}
          </div>

          {/* 右侧操作按钮 */}
          {!selectMode && (
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => openTagEditor(s)}
                title="改标签"
                className="p-1 rounded hover:bg-paper-line/30 active:scale-90 text-paper-ink3 hover:text-paper-accent text-sm"
              >🏷️</button>
              <button
                onClick={() => deleteOne(s.id)}
                title="删除"
                className="p-1 rounded hover:bg-red-50 active:scale-90 text-red-500 text-sm"
              >🗑️</button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
