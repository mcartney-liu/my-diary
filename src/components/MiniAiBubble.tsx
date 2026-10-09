import { useState, useRef, useEffect, useCallback } from "react";
import { askDiary } from "../api";
import type { DiaryBlock, MoodId } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diaryBlocks?: DiaryBlock[];
  moodId?: MoodId | null;
  onAppendBlock: (content: string) => void;
}

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: { diary_id: string; date?: string; score: number }[];
  canAppend?: boolean;
}

const MOOD_LABEL: Record<MoodId, string> = {
  happy: "开心", calm: "平静", sad: "难过", angry: "生气", anxious: "焦虑",
};

/** 从 blocks 里取最近的 text block 内容，截前 200 字 */
function getRecentText(blocks?: DiaryBlock[]): string {
  if (!blocks) return "";
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "text" && b.content?.trim() && !b.deleted) {
      return b.content.slice(0, 200);
    }
  }
  return "";
}

/** 快捷建议 */
const QUICK_SUGGESTIONS = [
  { label: "帮我润色", build: (text: string) => `帮我润色下面这段日记，保持原意但让它更生动：\n"${text}"` },
  { label: "起个标题", build: (text: string) => `给这段日记起 3 个不同风格的标题（简短、文艺、幽默各一个）：\n"${text}"` },
  { label: "写个结尾", build: (text: string) => `给这段日记写一个温暖的结尾（一句话到三句话）：\n"${text}"` },
  { label: "来句名言", build: (_: string, mood?: string) => `推荐 3 句关于"${mood || "生活"}"的名人名言，要简短，标出处。` },
];

export default function MiniAiBubble({ open, onOpenChange, diaryBlocks, moodId, onAppendBlock }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, loading, open]);

  const send = useCallback(async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const r = await askDiary(question);
      setMsgs((m) => [...m, {
        role: "ai",
        content: r.answer || "（没有回复）",
        sources: r.sources,
        canAppend: true,
      }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "ai", content: "抱歉，出了点问题：" + (e?.message || "请求失败") }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleQuickSuggestion = useCallback((idx: number) => {
    const sug = QUICK_SUGGESTIONS[idx];
    const recentText = getRecentText(diaryBlocks);
    const moodLabel = moodId ? MOOD_LABEL[moodId] : undefined;
    const prompt = sug.build(recentText, moodLabel);
    send(prompt);
  }, [diaryBlocks, moodId, send]);

  const handleAppend = useCallback((content: string) => {
    onAppendBlock(content);
  }, [onAppendBlock]);

  const handleNewChat = useCallback(() => {
    setMsgs([]);
    inputRef.current?.focus();
  }, []);

  if (!open) return null;

  return (
    <div className="ai-mini-panel">
          {/* 头部 */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-paper-line bg-paper-card/50 rounded-t-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🤖</span>
              <span className="text-sm font-medium text-paper-ink">小麦</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="text-xs text-paper-ink2 hover:text-paper-ink transition flex items-center gap-1"
                title="新对话"
              >
                🔄<span className="hidden sm:inline">新对话</span>
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="text-paper-ink2 hover:text-paper-ink text-sm w-5 h-5 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 对话区 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 custom-scroll">
            {msgs.length === 0 && (
              <>
                <div className="text-xs text-paper-ink2 leading-relaxed bg-paper-surface rounded-lg p-2.5 border border-paper-line">
                  👋 写日记卡壳了？问问我，回答可以一键贴进日记。
                </div>
                <div className="text-[11px] text-paper-ink3 px-0.5">快捷建议</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickSuggestion(i)}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-card text-paper-ink2 hover:bg-paper-line/40 hover:text-paper-ink transition active:scale-95"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-paper-ink text-paper-bg rounded-br-sm"
                      : "bg-paper-card border border-paper-line text-paper-ink rounded-bl-sm"
                  }`}
                >
                  {m.content}
                  {m.sources?.length ? (
                    <div className="mt-1.5 pt-1.5 border-t border-paper-line/60 text-[10px] text-paper-ink2">
                      📎 引用 {m.sources.length} 篇日记
                    </div>
                  ) : null}
                  {m.canAppend && (
                    <button
                      onClick={() => handleAppend(m.content)}
                      className="mt-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition active:scale-95"
                    >
                      📌 贴到日记
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-paper-card border border-paper-line rounded-xl rounded-bl-sm px-3 py-2 text-sm text-paper-ink2">
                  <span className="inline-block animate-pulse">思考中…</span>
                </div>
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="px-3 py-2 border-t border-paper-line bg-paper-card/50 rounded-b-xl">
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex gap-1.5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="问点什么吧…"
                className="flex-1 px-3 py-2 rounded-full border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent/50"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-3 py-2 rounded-full bg-paper-ink text-paper-bg text-sm disabled:opacity-40 hover:opacity-80 transition shrink-0"
              >
                发送
              </button>
            </form>
          </div>
    </div>
  );
}
