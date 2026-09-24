import { useState, useRef, useEffect } from "react";
import { askDiary } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: { diary_id: string; score: number }[];
}

const SUGGESTIONS = [
  "我写过什么主题的日记？",
  "最近花了多少钱？",
  "我最开心的一天是哪天？",
];

export default function AiDrawer({ open, onClose }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, open]);

  if (!open) return null;

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const r = await askDiary(question);
      setMsgs((m) => [...m, { role: "ai", content: r.answer || "（没有回复）", sources: r.sources }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "ai", content: "抱歉，出了点问题：" + (e?.message || "请求失败") }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-[#faf6ef] border-l border-paper-line flex flex-col h-full">
        <div className="px-5 py-4 border-b border-paper-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="font-semibold text-paper-ink">我的日记 AI</span>
          </div>
          <button onClick={onClose} className="text-paper-ink2 hover:text-paper-ink text-xl">✕</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {msgs.length === 0 && (
            <>
              <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
                👋 Hi，我是你的日记 AI 助手。我会根据你写过的日记来回答问题。
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-paper-line bg-paper-card text-paper-ink2 hover:bg-paper-line/40 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-paper-ink text-paper-bg rounded-br-sm"
                    : "bg-paper-card border border-paper-line text-paper-ink rounded-bl-sm"
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
              <div className="bg-paper-card border border-paper-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-paper-ink2">
                <span className="inline-block animate-pulse">思考中…</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-paper-line bg-paper-card/50">
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
              placeholder="问点什么吧…"
              className="flex-1 px-4 py-2.5 rounded-full border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-ink/50"
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
      </div>
    </div>
  );
}
