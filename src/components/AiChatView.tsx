import { useState, useRef, useEffect, useMemo } from "react";
import { askDiary } from "../api";

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: { diary_id: string; score: number }[];
}

interface Session {
  id: string;
  title: string;
  msgs: Msg[];
  createdAt: number;
}

const STORAGE_KEY = "mydiary-web:chat:sessions";
const ACTIVE_KEY = "mydiary-web:chat:active";

const SUGGESTIONS = [
  "我写过什么主题的日记？",
  "最近花了多少钱？",
  "我最开心的一天是哪天？",
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadData(): { sessions: Session[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list: Session[] = JSON.parse(raw);
      if (list.length) {
        const active = localStorage.getItem(ACTIVE_KEY) || list[0].id;
        const found = list.find((s) => s.id === active);
        return { sessions: list, activeId: found ? found.id : list[0].id };
      }
    }
  } catch {}
  const first: Session = { id: uid(), title: "新对话", msgs: [], createdAt: Date.now() };
  return { sessions: [first], activeId: first.id };
}

export default function AiChatView() {
  const initial = useMemo(loadData, []);
  const [sessions, setSessions] = useState<Session[]>(initial.sessions);
  const [activeId, setActiveId] = useState<string>(initial.activeId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {}
  }, [sessions, activeId]);

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
      const r = await askDiary(question);
      const aiMsg: Msg = {
        role: "ai",
        content: r.answer || "（没有回复）",
        sources: r.sources,
      };
      updateActive((s) => ({ ...s, msgs: [...s.msgs, aiMsg] }));
    } catch (e: any) {
      updateActive((s) => ({
        ...s,
        msgs: [...s.msgs, { role: "ai", content: "抱歉，出了点问题：" + (e?.message || "请求失败") }],
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
        <span className="text-sm text-paper-ink2 truncate mx-2">{active?.title || "💬 我的日记知识库"}</span>
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
              💬 这是你的日记知识库。写下的每一篇都可以被我找到。试试问点什么吧～
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
                <div className="mt-2 pt-2 border-t border-paper-line/60 text-[11px] text-paper-ink2">
                  📎 引用 {m.sources.length} 篇日记
                </div>
              ) : null}
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
