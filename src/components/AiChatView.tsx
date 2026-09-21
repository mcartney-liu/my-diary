import { useState, useRef, useEffect, useMemo } from "react";
import { askDiary, extractMemory } from "../api";
import { useAuth } from "../AuthContext";

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: { diary_id: string; date?: string; score: number; content?: string }[];
}

interface Session {
  id: string;
  title: string;
  msgs: Msg[];
  createdAt: number;
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
  const first: Session = { id: uid(), title: "新对话", msgs: [], createdAt: Date.now() };
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
      const res = await askDiary(question, recent);
      updateActive((s) => ({
        ...s,
        msgs: [...s.msgs, { role: 'ai', content: res.answer, sources: res.sources || [] }],
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

  function newChat() {
    const id = uid();
    const s: Session = { id, title: "新对话", msgs: [], createdAt: Date.now() };
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
          const fresh: Session = { id: uid(), title: "新对话", msgs: [], createdAt: Date.now() };
          setActiveId(fresh.id);
          return [fresh];
        }
        setActiveId(next[0].id);
      }
      return next;
    });
  }

  return (
    <section className="card p-0 animate-fade-up overflow-hidden flex flex-col relative" style={{ minHeight: "60vh", maxHeight: "70vh" }}>
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-paper-line bg-paper-surface/60">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs px-2.5 py-1.5 rounded-full border border-paper-line bg-white text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95"
          title="历史对话"
        >
          ☰
        </button>
        <span className="text-sm text-paper-ink2 truncate mx-2">{active?.title || "💬 小麦"}</span>
        <button
          onClick={newChat}
          className="text-xs px-3 py-1.5 rounded-full border border-paper-line bg-white text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95"
          title="新建对话"
        >
          ＋ 新对话
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
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
                  s.id === activeId ? "bg-paper-line/60" : "hover:bg-paper-surface"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-paper-ink truncate">{s.title || "新对话"}</div>
                  <div className="text-[11px] text-paper-ink2 mt-0.5">
                    {s.msgs.length} 条 · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-paper-ink2 hover:text-red-500 text-xs ml-2 px-1"
                    title="删除"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 对话区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {active?.msgs.length === 0 && (
          <>
            <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
              💬 这是小麦，你的 AI 助手。写下的每一篇日记都可以被我找到。试试问点什么吧～
            </div>
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
                  <div className="text-[11px] text-paper-ink2">📎 引用 {m.sources.length} 篇日记</div>
                  {m.sources.map((s, i) => (
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



