import { useState, useRef, useEffect, useMemo } from "react";
import { askDiary, askWiki, extractMemory, wikiListKbs, type WikiKB } from "../api";
import { useAuth } from "../AuthContext";

interface DiarySource { diary_id: string; date?: string; score: number; content?: string; }
interface WikiSource { page_id: string; title: string; summary: string; score: number; }

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: DiarySource[] | WikiSource[];
  source_type?: "diary" | "wiki";
  kb_title?: string;
  web_search?: boolean;  // 这条 AI 回答用的联网开关（知识库模式）
}

interface Session {
  id: string;
  title: string;
  msgs: Msg[];
  createdAt: number;
  source_type?: "diary" | "wiki";
  kb_id?: string;
  default_web_search?: boolean;  // 记住用户上次选的联网偏好
}

const SUGGESTIONS = [
  "我写过什么主题的日记？",
  "最近花了多少钱？",
  "我最开心的一天是哪天？",
];

// 记住这句话按钮
function RememberButton({ content }: { content: string }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memContent, setMemContent] = useState<string>("");
  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      // 让后端 LLM 从原话里解析出简洁的记忆（自动存 DB）
      const res = await extractMemory(content);
      const mems = res?.memories || [];
      if (mems.length > 0) {
        setMemContent(mems[0].content);
        setSaved(true);
        setTimeout(() => { setSaved(false); setMemContent(""); }, 3000);
      } else {
        // LLM 没提取到，静默跳过
      }
    } catch {
      // 静默失败
    } finally {
      setSaving(false);
    }
  };
  return (
    <button
      onClick={handleSave}
      disabled={saved || saving}
      className="mt-1.5 text-[11px] text-paper-bg/70 hover:text-paper-bg transition opacity-60 hover:opacity-100"
      title="AI 会把这句话解析成简洁记忆存下来"
    >
      {saved ? `💾 已记住：${memContent || ""} 🌟` : saving ? "解析并保存中…" : "💾 记住这句话"}
    </button>
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function storageKeys(userId: string): { sessions: string; active: string } {
  return {
    sessions: `mydiary-web:chat:sessions:${userId}`,
    active: `mydiary-web:chat:active:${userId}`,
  };
}

function loadDataFor(userId: string): { sessions: Session[]; activeId: string } {
  const keys = storageKeys(userId);
  try {
    const raw = localStorage.getItem(keys.sessions);
    if (raw) {
      const list: Session[] = JSON.parse(raw);
      if (list.length) {
        const active = localStorage.getItem(keys.active) || list[0].id;
        const found = list.find((s) => s.id === active);
        return { sessions: list, activeId: found ? found.id : list[0].id };
      }
    }
  } catch {}
  const first: Session = { id: uid(), title: "新对话", msgs: [], createdAt: Date.now(), source_type: "diary" };
  return { sessions: [first], activeId: first.id };
}

export default function AiChatView() {
  const { user } = useAuth();
  const userId = user?.id || "anon";
  const keys = useMemo(() => storageKeys(userId), [userId]);

  const initial = useMemo(() => loadDataFor(userId), [userId]);
  const [sessions, setSessions] = useState<Session[]>(initial.sessions);
  const [activeId, setActiveId] = useState<string>(initial.activeId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // KB 列表（用于知识库模式下拉选）
  const [kbs, setKbs] = useState<WikiKB[]>([]);
  useEffect(() => {
    wikiListKbs().then((r) => setKbs(r?.kbs || [])).catch(() => {});
  }, [userId]);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  // 切换账号时重新加载
  useEffect(() => {
    const d = loadDataFor(userId);
    setSessions(d.sessions);
    setActiveId(d.activeId);
  }, [userId]);

  // 持久化（按账号隔离）
  useEffect(() => {
    try {
      localStorage.setItem(keys.sessions, JSON.stringify(sessions));
      localStorage.setItem(keys.active, activeId);
    } catch {}
  }, [sessions, activeId, keys.sessions, keys.active]);

  // 自动滚到底
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.msgs.length, loading]);

  // 切换会话后滚到底
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId]);

  function updateActive(updater: (s: Session) => Session) {
    setSessions((list) => list.map((s) => (s.id === activeId ? updater(s) : s)));
  }

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: question };
    updateActive((s) => ({
      ...s,
      title: s.msgs.length === 0 ? question.slice(0, 16) : s.title,
      msgs: [...s.msgs, userMsg],
    }));
    setLoading(true);
    try {
      const recent = [...active.msgs].slice(-6).map((m): { role: "user" | "assistant"; content: string } => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.content,
      }));

      const srcType = active.source_type || "diary";
      let resAnswer = "";
      let resSources: any[] = [];
      let resKbTitle: string | undefined;

      if (srcType === "wiki") {
        // 知识库问答
        if (!active.kb_id) {
          updateActive((s) => ({
            ...s,
            msgs: [...s.msgs, { role: 'ai', content: '请先选择一个知识库 💡', sources: [], source_type: 'wiki' }],
          }));
          setLoading(false);
          return;
        }
        const useWebSearch = !!active.default_web_search;
        const res = await askWiki(question, active.kb_id, recent, useWebSearch);
        resAnswer = res.answer;
        resSources = res.sources || [];
        resKbTitle = res.kb_title;
        // AI 回答里记住这次用的联网开关
        updateActive((s) => ({
          ...s,
          msgs: [...s.msgs, { role: 'ai', content: resAnswer, sources: resSources, source_type: srcType, kb_title: resKbTitle, web_search: useWebSearch }],
        }));
        return;
      } else {
        // 日记问答（原链路不动）
        const res = await askDiary(question, recent);
        resAnswer = res.answer;
        resSources = res.sources || [];
      }

      updateActive((s) => ({
        ...s,
        msgs: [...s.msgs, { role: 'ai', content: resAnswer, sources: resSources, source_type: srcType, kb_title: resKbTitle }],
      }));
    } catch (e: any) {
      updateActive((s) => ({
        ...s,
        msgs: [...s.msgs, { role: 'ai', content: '抱歉，出了点问题：' + (e?.message || '请求失败'), sources: [] }],
      }));
    } finally {
      setLoading(false);
    }
  }

  // 用相反的 web_search 重试某条 AI 回答（替换该条，不新增气泡）
  async function retryWikiAnswer(aiIdx: number, newWebSearch: boolean) {
    if (loading) return;
    const s = active;
    if (!s || !s.kb_id) return;
    // 找到这条 AI 消息前面的 user 消息（就是要重问的那个问题）
    const targetAi = s.msgs[aiIdx];
    if (!targetAi || targetAi.role !== "ai" || targetAi.source_type !== "wiki") return;
    // 往上找 user 消息
    let question = "";
    for (let j = aiIdx - 1; j >= 0; j--) {
      if (s.msgs[j].role === "user") { question = s.msgs[j].content; break; }
    }
    if (!question) return;

    setLoading(true);
    // 先把这条 AI 消息标记为 loading（保留位置）
    updateActive((cur) => {
      const newMsgs = [...cur.msgs];
      newMsgs[aiIdx] = { ...newMsgs[aiIdx], content: "...思考中", sources: [] };
      return { ...cur, msgs: newMsgs };
    });

    try {
      const recent = s.msgs.slice(0, aiIdx).slice(-6).map((m): any => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.content,
      }));
      const res = await askWiki(question, s.kb_id, recent, newWebSearch);
      // 替换这条 AI 消息
      updateActive((cur) => {
        const newMsgs = [...cur.msgs];
        newMsgs[aiIdx] = {
          role: 'ai',
          content: res.answer,
          sources: res.sources || [],
          source_type: 'wiki',
          kb_title: res.kb_title,
          web_search: newWebSearch,
        };
        // 记住这个偏好，后续新问题默认用它
        return { ...cur, msgs: newMsgs, default_web_search: newWebSearch };
      });
    } catch (e: any) {
      updateActive((cur) => {
        const newMsgs = [...cur.msgs];
        newMsgs[aiIdx] = { ...newMsgs[aiIdx], content: '抱歉，重试失败：' + (e?.message || '请求失败') };
        return { ...cur, msgs: newMsgs };
      });
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    const id = uid();
    // 新对话继承当前会话的 source_type 和 kb_id（方便连续操作）
    const s: Session = {
      id, title: "新对话", msgs: [], createdAt: Date.now(),
      source_type: active?.source_type || "diary",
      kb_id: active?.source_type === "wiki" ? active.kb_id : undefined,
    };
    setSessions((list) => [s, ...list]);
    setActiveId(id);
    setShowHistory(false);
  }

  function switchSession(id: string) {
    setActiveId(id);
    setShowHistory(false);
  }

  function deleteSession(id: string) {
    setSessions((list) => {
      const next = list.filter((s) => s.id !== id);
      if (id === activeId) {
        if (next.length === 0) {
          const fresh: Session = { id: uid(), title: "新对话", msgs: [], createdAt: Date.now(), source_type: "diary" };
          setActiveId(fresh.id);
          return [fresh];
        }
        setActiveId(next[0].id);
      }
      return next;
    });
  }

  // 切换 source_type → 自动新建/跳转到该类型的空会话（两种类型隔离）
  function setSourceTypeForActive(type: "diary" | "wiki") {
    // 如果当前已经是这个类型，什么都不做
    if ((active?.source_type || "diary") === type) return;

    // 看看 sessions 里有没有这个类型的空会话 → 有就直接切过去
    const existingEmpty = sessions.find((s) =>
      (s.source_type || "diary") === type && s.msgs.length === 0
    );
    if (existingEmpty) {
      setActiveId(existingEmpty.id);
      return;
    }

    // 没有 → 新建空会话
    const defaultKb = type === "wiki" ? (kbs[0]?.id || undefined) : undefined;
    const s: Session = {
      id: uid(),
      title: "新对话",
      msgs: [],
      createdAt: Date.now(),
      source_type: type,
      kb_id: defaultKb,
    };
    setSessions((list) => [s, ...list]);
    setActiveId(s.id);
  }
  // 切换当前会话的 kb_id
  function setKbForActive(kbId: string) {
    updateActive((s) => ({ ...s, kb_id: kbId }));
  }

  const activeType = active?.source_type || "diary";
  const activeKb = kbs.find((k) => k.id === active?.kb_id);

  return (
    <section className="card p-0 animate-fade-up overflow-hidden flex flex-col relative" style={{ minHeight: "60vh", maxHeight: "70vh" }}>
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-paper-line bg-paper-surface/60 gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs px-2 py-1 rounded-full border border-paper-line bg-white text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95 shrink-0"
            title="历史对话"
          >
            ☰
          </button>
          {/* source_type 切换器 */}
          <div className="flex items-center bg-paper-bg rounded-full px-0.5 py-0.5 border border-paper-line shrink-0">
            <button
              onClick={() => setSourceTypeForActive("diary")}
              className={`text-[11px] px-2 py-0.5 rounded-full transition ${
                activeType === "diary" ? "bg-white text-paper-ink shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              📖 日记
            </button>
            <button
              onClick={() => setSourceTypeForActive("wiki")}
              className={`text-[11px] px-2 py-0.5 rounded-full transition ${
                activeType === "wiki" ? "bg-white text-paper-ink shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              🌳 知识
            </button>
          </div>
          {/* 知识库模式：KB 下拉 */}
          {activeType === "wiki" && (
            <select
              value={active?.kb_id || ""}
              onChange={(e) => setKbForActive(e.target.value)}
              className="text-[11px] border border-paper-line bg-white rounded-full px-2 py-0.5 text-paper-ink2 min-w-0 max-w-[120px] focus:outline-none focus:border-paper-ink"
              title="选择知识库"
            >
              <option value="">选知识库…</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.title}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={newChat}
          className="text-xs px-2.5 py-1 rounded-full border border-paper-line bg-white text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95 shrink-0"
          title="新建对话"
        >
          ＋
        </button>
      </div>

      {/* 历史会话抽屉 */}
      {showHistory && (
        <div className="absolute top-[48px] left-0 right-0 bottom-0 z-10 bg-paper-bg/95 backdrop-blur-sm flex flex-col border-r border-paper-line">
          <div className="px-4 py-3 border-b border-paper-line text-xs text-paper-ink2 flex items-center justify-between">
            <span>历史对话（{sessions.length}）</span>
            <button onClick={() => setShowHistory(false)} className="hover:text-paper-ink">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {sessions.map((s) => {
              const sType = s.source_type || "diary";
              const sKb = s.kb_id ? kbs.find((k) => k.id === s.kb_id) : null;
              return (
                <div
                  key={s.id}
                  onClick={() => switchSession(s.id)}
                  className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
                    s.id === activeId ? "bg-paper-line/60" : "hover:bg-paper-surface"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-paper-ink truncate flex items-center gap-1.5">
                      <span className="text-[11px] opacity-70 shrink-0">
                        {sType === "wiki" ? "🌳" : "📖"}
                      </span>
                      {s.title || "新对话"}
                    </div>
                    <div className="text-[11px] text-paper-ink2 mt-0.5 truncate">
                      {s.msgs.length} 条 · {new Date(s.createdAt).toLocaleString()}
                      {sType === "wiki" && sKb ? ` · ${sKb.title}` : ""}
                    </div>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-paper-ink2 hover:text-red-500 text-xs ml-2 px-1 shrink-0"
                      title="删除"
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 对话区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {active?.msgs.length === 0 && (
          <>
            <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
              {activeType === "wiki"
                ? activeKb
                  ? `🌳 我在「${activeKb.title}」知识库里，问我点什么吧～`
                  : "🌳 先从顶部选一个知识库，我就能帮你提问啦～"
                : "💬 这是小麦，你的 AI 助手。写下的每一篇日记都可以被我找到。试试问点什么吧～"}
            </div>
            {activeType === "diary" && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-paper-line bg-white text-paper-ink2 hover:bg-paper-line/40 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {active?.msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-paper-ink text-paper-bg rounded-br-sm"
                  : "bg-white border border-paper-line text-paper-ink rounded-bl-sm"
              }`}
            >
              {m.content}
              {m.sources?.length ? (
                <div className="mt-2 pt-2 border-t border-paper-line/60 space-y-1.5">
                  <div className="text-[11px] text-paper-ink2">
                    📎 引用 {m.sources.length} {m.source_type === "wiki" ? "个知识页面" : "篇日记"}
                  </div>
                  {m.source_type === "wiki"
                    ? // WikiSource 渲染（可点击跳转知识库页面）
                      (m.sources as WikiSource[]).map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            const kbId = active?.kb_id;
                            if (!kbId || !s.page_id) return;
                            // 通知父页面切到 wiki tab + KnowledgeBase 打开这个页面
                            window.dispatchEvent(new CustomEvent('kb-open-page', {
                              detail: { kbId, pageId: s.page_id, title: s.title }
                            }));
                          }}
                          className="w-full text-left rounded-lg border border-paper-line/60 bg-paper-surface/40 px-2.5 py-1.5 text-[11px] text-paper-ink2 hover:bg-paper-surface hover:border-paper-accent/40 transition cursor-pointer"
                        >
                          <span className="text-paper-accent">[[{s.title}]]</span>
                          <span className="text-paper-ink2/60 ml-1">· 相关度 {Math.round(s.score * 100)}%</span>
                          {s.summary && <div className="mt-0.5 text-paper-ink2/70 truncate">{s.summary}</div>}
                        </button>
                      ))
                    : // DiarySource 渲染
                      (m.sources as DiarySource[]).map((s, i) => (
                        <details key={i} className="group rounded-lg border border-paper-line/60 bg-paper-surface/40 overflow-hidden">
                          <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] text-paper-ink2 flex items-center justify-between hover:bg-paper-surface/80 transition-colors">
                            <span className="flex items-center gap-1.5">
                              <span className="text-paper-accent">{s.date?.slice(5) || '未知'}</span>
                              <span className="text-paper-ink2/60">·</span>
                              <span>相关度 {Math.round(s.score * 100)}%</span>
                            </span>
                            <span className="text-paper-ink2/40 transition-transform group-open:rotate-180">▾</span>
                          </summary>
                          <div className="px-2.5 py-2 text-[11px] leading-relaxed text-paper-ink2 border-t border-paper-line/40 bg-white/60">
                            {s.content}
                          </div>
                        </details>
                      ))}
                </div>
              ) : null}
              {m.role === "user" && (
                <RememberButton content={m.content} />
              )}
              {/* wiki 模式的 AI 回答底部：联网开关重试 */}
              {m.role === "ai" && m.source_type === "wiki" && (
                <div className="mt-2 pt-2 border-t border-paper-line/60 flex items-center gap-1.5">
                  {m.web_search ? (
                    <>
                      <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">🔎 联网回答</span>
                      <button
                        onClick={() => retryWikiAnswer(i, false)}
                        disabled={loading}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-paper-line text-paper-ink2 hover:bg-paper-surface disabled:opacity-50 transition"
                        title="仅查知识库，重试"
                      >
                        🔒 仅本地重试
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-paper-ink2 bg-paper-surface/60 px-1.5 py-0.5 rounded">🔒 仅本地</span>
                      <button
                        onClick={() => retryWikiAnswer(i, true)}
                        disabled={loading}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 text-blue-600 bg-blue-50/40 hover:bg-blue-50 disabled:opacity-50 transition"
                        title="AI 用自己的知识补充，重试"
                      >
                        🔎 联网重试
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-paper-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-paper-ink2">
              <span className="inline-block animate-pulse">思考中…</span>
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="px-5 py-3 border-t border-paper-line bg-paper-surface/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问点什么…"
            className="flex-1 px-4 py-2.5 rounded-full border border-paper-line bg-white text-sm focus:outline-none focus:border-paper-ink/50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-full bg-paper-ink text-paper-bg text-sm disabled:opacity-40 hover:opacity-80 transition"
          >
            发送
          </button>
        </form>
      </div>
    </section>
  );
}



