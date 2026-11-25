import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../uiFeedback";
import { askDiary, askDiaryStream, AskStreamError, askWiki, addMemory, upsertDiary, listTemplates, wikiListKbs, wikiAddKb, wikiAddCategory, wikiAIDesignCategories, wikiOptimizeDescription, chatListSessions, chatUpsertSessions, chatDeleteSession, wikiAddSourceText, wikiIngestAll, wikiGetPage, type WikiKB, type WikiPage } from "../api";
import Modal from "./Modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { callChatCompletion, getAiProvider, detectTemplate } from "../ai";
import { useAuth } from "../AuthContext";
import { listMemory, lifeOverview, getToken, kbDescText, type LifeItem } from "../api";
import { cachedGet, peek } from "../dataCache";
import Xiaomai, { moodFor } from "./Xiaomai";

// 回答用 Markdown 渲染（原来是纯文本，**加粗**、- 列表 会原样露出来）
const MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-paper-ink">{children}</strong>,
  h1: ({ children }: { children?: ReactNode }) => <div className="font-semibold mt-2 mb-1">{children}</div>,
  h2: ({ children }: { children?: ReactNode }) => <div className="font-semibold mt-2 mb-1">{children}</div>,
  h3: ({ children }: { children?: ReactNode }) => <div className="font-semibold mt-2 mb-1">{children}</div>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-paper-accent underline">{children}</a>,
  code: ({ children }: { children?: ReactNode }) => <code className="bg-paper-line/50 px-1 rounded text-xs">{children}</code>,
};
function fmtMD(d?: string) {
  if (!d) return "";
  const [, m, dd] = d.split("-").map(Number);
  return m && dd ? `${m}月${dd}日` : d;
}

interface DiarySource { diary_id: string; date?: string; score: number; content?: string; }
interface WikiSource { page_id: string; title: string; summary: string; score: number; }

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: DiarySource[] | WikiSource[];
  source_type?: "diary" | "wiki";
  kb_title?: string;
  web_search?: boolean;  // 这条 AI 回答用的联网开关（知识库模式）
  // import_mode 相关
  can_save?: boolean;         // 这条 AI 回答可以汇入知识库
  category_hint?: string;     // 推荐汇入的分类
  import_mode?: boolean;      // 这条回答是否来自 import_mode 流程
  need_confirm?: boolean;     // check-match low，需要用户确认
  match_reason?: string;
  importing?: boolean;        // 汇入中
  imported?: boolean;         // 已汇入
  streaming?: boolean;        // 流式输出中（不持久化到云端）
  suggest?: string[];         // 这条回答附带的推荐追问（只属于这个会话）
}

interface Session {
  id: string;
  title: string;
  msgs: Msg[];
  createdAt: number;
  source_type?: "diary" | "wiki";
  kb_id?: string;
  default_web_search?: boolean;  // 这个会话是否联网（每个会话单独记）
  updatedAt?: number;            // 最近一次有新消息的时间（历史排序、切回时找最近会话）
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
      const res = await addMemory('fact', content.trim());
      if (res?.ok) {
        setMemContent(content.trim());
        setSaved(true);
        setTimeout(() => { setSaved(false); setMemContent(""); }, 3000);
      }
    } catch (e) {
      console.error('[memory] remember failed:', e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <button
      onClick={handleSave}
      disabled={saved || saving}
      className="mt-1.5 text-[11px] text-paper-bg/70 hover:text-paper-bg opacity-0 group-hover:opacity-100 focus:opacity-100 transition opacity-60 hover:opacity-100"
      title="把这句话原样存进小麦的记忆"
    >
      {saved ? `💾 已记住：${memContent || ""} 🌟` : saving ? "保存中…" : "💾 记住这句话"}
    </button>
  );
}

function SessionRow({ s, activeId, onSwitch, onDelete, source }: { s: Session; activeId: string; onSwitch: (id: string) => void; onDelete: (id: string) => void; source?: string }) {
  return (
    <div
      onClick={() => onSwitch(s.id)}
      className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
        s.id === activeId ? "bg-paper-line/60" : "hover:bg-paper-surface"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-paper-ink truncate flex items-center gap-1.5">
          <span className="truncate">{s.title || "新对话"}</span>
        </div>
        <div className="text-[11px] text-paper-ink2 mt-0.5 truncate flex items-center gap-1.5">
          {/* 来源标签：问的是日记，还是哪个知识库 */}
          <span className={`shrink-0 px-1.5 rounded ${(s.source_type || "diary") === "wiki" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {source || ((s.source_type || "diary") === "wiki" ? "📚 知识库" : "📖 日记")}
          </span>
          {s.default_web_search && <span className="shrink-0 text-blue-600">🌐</span>}
          <span className="truncate">{s.msgs.length} 条 · {sessionTime(s)}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
        className="opacity-0 group-hover:opacity-100 text-paper-ink2 hover:text-red-500 text-xs ml-2 px-1 shrink-0"
        title="删除"
      >
        🗑
      </button>
    </div>
  );
}

function sessionTime(s: Session): string {
  const last = s.updatedAt || s.createdAt;
  const d = new Date(last), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
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

/** 用户头像：和底栏"我的"用同一个头像（预设图 avatar-xxx / emoji-x），没有就显示昵称首字 */
function UserAvatar() {
  const u = peek<any>("profile")?.user || {};
  const key: string = u.avatar || "";
  const name: string = (u.nickname || u.email || "我").trim();
  return (
    <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-paper-surface border border-paper-line/70 flex items-center justify-center text-sm font-medium text-paper-ink">
      {key.startsWith("emoji-") ? <span className="text-lg">{key.slice(6)}</span>
        : key ? <img src={/^(https?:|data:|\/)/.test(key) ? key : `/avatars/${key}.jpg`} alt="" className="w-full h-full object-contain" />
        : <span>{name.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
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
  // 收集模式：用户手动开启的收集并汇入模式（知识 tab 才显示）
  const [collectionMode, setCollectionMode] = useState(false);
  // 收集气泡弹层开关
  const [collectPopOpen, setCollectPopOpen] = useState(false);
  // AI 推荐的后续问题：存在每条 AI 消息上（Msg.suggest），显示时取当前会话最后一条回答的
  // 旧版是组件级一个 state → 切换知识库 / 会话后，上一个库的推荐问题还挂在新库下面
  // 知识页面弹窗：点击引用链接或 [[xxx]] 时打开
  const [pageModal, setPageModal] = useState<{ kbId: string; page: WikiPage } | null>(null);
  // 联网开关跟着会话走：读写当前会话的 default_web_search（旧版是组件级一个开关，切库 / 切会话后还开着）
  const scrollRef = useRef<HTMLDivElement>(null);

  // KB 列表（用于知识库模式下拉选）
  const [kbs, setKbs] = useState<WikiKB[]>([]);
  useEffect(() => {
    wikiListKbs().then((r) => setKbs(r?.kbs || [])).catch(() => {});
  }, [userId]);

  // 小麦引导创建 KB 模式：用户选"+ 创建知识库"后进入
  // 创建知识库专用流程状态机：null=不在流程 | "collecting"=收集中 | "creating"=一条龙跑中 | "done"=完成
  const [creatingKb, setCreatingKb] = useState<null | "collecting" | "creating" | "done">(null);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];
  const webSearchMode = !!active?.default_web_search;
  const setWebSearchMode = (fn: (v: boolean) => boolean) =>
    setSessions((list) => list.map((s) => (s.id === activeId ? { ...s, default_web_search: fn(!!s.default_web_search) } : s)));
  const nav = useNavigate();

  // 欢迎页：按用户自己的数据生成推荐问题，并带一句"小麦记得的事"
  const [people, setPeople] = useState<LifeItem[]>(() => peek<any>("life:overview")?.items ?? []);
  const [memories, setMemories] = useState<string[]>(() => (peek<any>("memory:all")?.memories ?? []).map((m: any) => m.content));
  useEffect(() => {
    if (!getToken()) return;
    cachedGet<any>("life:overview", lifeOverview).then((r) => setPeople(r?.items ?? [])).catch(() => {});
    cachedGet<any>("memory:all", listMemory, { ttl: 60_000 }).then((r) => setMemories((r?.memories ?? []).filter((m: any) => m.status !== "archived").map((m: any) => m.content))).catch(() => {});
  }, [userId]);
  const personalSuggestions = useMemo(() => {
    const out: string[] = [];
    const topPerson = people.find((p) => p.kind === "person");
    if (topPerson) out.push(`我和${topPerson.title}最近都做了什么？`);
    out.push("这个月我的心情怎么样？");
    out.push("去年的今天我在做什么？");
    const topPlace = people.find((p) => p.kind === "place");
    if (topPlace) out.push(`我上次去${topPlace.title}是什么时候？`);
    out.push("最近有什么让我开心的事？");
    return out.slice(0, 4);
  }, [people]);
  const rememberLine = memories.length ? memories[Math.floor(Date.now() / 86400000) % memories.length] : "";

  // 切换账号时重新加载（本地 + 云端）
  useEffect(() => {
    const d = loadDataFor(userId);
    setSessions(d.sessions);
    setActiveId(d.activeId);

    // 从云端拉取（云端优先覆盖本地）
    chatListSessions().then((res) => {
      if (res?.sessions && res.sessions.length > 0) {
        const cloud = res.sessions.map((cs: any) => ({
          id: cs.id, title: cs.title, source_type: cs.source_type,
          kb_id: cs.kb_id, msgs: cs.msgs, createdAt: cs.createdAt, updatedAt: cs.updatedAt,
        } as Session));
        // 合并：云端有就用云端（新），没有就保留本地
        const localIds = new Set(d.sessions.map(s => s.id));
        const merged = [...cloud];
        for (const ls of d.sessions) {
          if (!localIds.has(ls.id)) merged.push(ls);
        }
        // 过滤空会话
        const nonEmpty = merged.filter(s => s.msgs.length > 0);
        setSessions(nonEmpty.length > 0 ? nonEmpty : merged);
        // activeId 云端有就用云端的
        if (cloud.find(s => s.id === d.activeId)) {
          setActiveId(d.activeId);
        } else if (cloud.length > 0) {
          setActiveId(cloud[0].id);
        }
      }
    }).catch(() => {});  // 云端挂了就用本地
  }, [userId]);

  // 持久化（本地 + debounce 同步云端）
  const syncTimerRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      const nonEmpty = sessions.filter((s) => s.msgs.length > 0);
      localStorage.setItem(keys.sessions, JSON.stringify(nonEmpty.map((s) => ({ ...s, msgs: s.msgs.filter((m) => !m.streaming) }))));
      localStorage.setItem(keys.active, activeId);

      // debounce 500ms 同步云端
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        chatUpsertSessions(nonEmpty.map(s => ({
          id: s.id, title: s.title, source_type: s.source_type || "diary",
          kb_id: s.kb_id, msgs: s.msgs.filter((m) => !m.streaming), createdAt: s.createdAt, updatedAt: s.updatedAt || s.createdAt,
        }))).catch(() => {});
      }, 500);
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
    setSessions((list) => list.map((s) => (s.id === activeId ? { ...updater(s), updatedAt: Date.now() } : s)));
  }

  async function send(q?: string, forceImportMode?: boolean) {
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
        // ═══════════════════════════════════════════════
        // 创建知识库聊天框（正常聊天 + 有边界）
        // ═══════════════════════════════════════════════
        if (creatingKb !== null) {

          // 已完成：用户再说任何事 → 引导去详情页
          if (creatingKb === "done") {
            updateActive((s) => ({
              ...s,
              msgs: [...s.msgs, {
                role: "ai", source_type: "wiki",
                content: "我这边只帮你创建知识库，已经帮你建好啦 ✅\n\n去「我的 → 知识库」看详情、汇入资料，或者选一个知识库开始提问～",
              }],
            }));
            setLoading(false);
            return;
          }

          // 跑一条龙中 → 忽略用户输入
          if (creatingKb === "creating") {
            updateActive((s) => ({
              ...s,
              msgs: [...s.msgs, {
                role: "ai", source_type: "wiki",
                content: "正在为你创建，请稍等... ⏳",
              }],
            }));
            setLoading(false);
            return;
          }

          // collecting：调 AI 正常对话
          // 构建历史消息（只传 user + ai，不传 source）
          const chatHistory = active.msgs.map((m) => ({
            role: m.role === "ai" ? "assistant" as const : "user" as const,
            content: m.content,
          }));
          chatHistory.push({ role: "user", content: question });

          const SYSTEM_PROMPT = `你是"小麦"，专门帮用户创建知识库的助手。

你的职责：
1. 和用户自然聊天，理解用户想创建什么样的知识库
2. 最终目标：拿到「知识库名称」和「知识库说明（用来干嘛的）」
3. **重要：拿到这两个信息后，先不要创建！先用自然语言跟用户确认，比如："我整理一下：名字叫 XXX，用途是 YYY，对吗？"**
4. **只有当用户明确说"好的"/"确认"/"就这个"/"可以"/"创建吧"等确认语之后，才返回 action=create**
5. 如果用户要求修改名字或说明，更新后再次用自然语言跟用户确认，不要直接 create
6. 如果用户没给全信息（只给了名字或只给了说明），引导用户补全
7. 如果用户问流程/规则/自我介绍，自然回答，用中文，口语化
8. 如果用户聊别的/无关内容，委婉引导回创建知识库的话题

返回格式（严格 JSON）：
- 所有聊天/引导/确认环节 → {"action":"chat","text":"你的自然回复"}
- 只有用户明确确认后才返回 → {"action":"create","name":"xxx","desc":"xxx","replyText":"收到！开始创建"}

知识库说明(desc)要简洁明了，描述清楚这个知识库用来做什么、包含哪些内容。`;

          try {
            const provider = getAiProvider();
            const aiRaw = await callChatCompletion(
              provider,
              [
                { role: "system", content: SYSTEM_PROMPT },
                ...chatHistory,
              ],
              0.7,
              "json_object"
            );

            let aiJson: any;
            try { aiJson = JSON.parse(aiRaw); } catch { aiJson = null; }

            if (aiJson?.action === "create" && aiJson.name && aiJson.desc) {
              // AI 判断信息够了 → 跑一条龙
              const kbName = aiJson.name.trim();
              let kbDesc = aiJson.desc.trim();

              setCreatingKb("creating");
              updateActive((s) => ({
                ...s,
                msgs: [...s.msgs, {
                  role: "ai", source_type: "wiki",
                  content: (aiJson.replyText || `收到！正在为你创建「**${kbName}**」...`).replace(/\n/g, "\n") +
                    `\n\n📝 说明：${kbDesc}`,
                }],
              }));

              try {
                try {
                  const opt = await wikiOptimizeDescription(kbDesc, kbName).catch(() => null);
                  if (opt?.description) kbDesc = opt.description;
                } catch {}
                const newKb = await wikiAddKb(kbName, kbDesc);

                let createdCats: { name: string; template_key?: string }[] = [];
                try {
                  const r = await wikiAIDesignCategories(newKb.title, newKb.description || kbDesc);
                  for (const c of r.categories) {
                    try {
                      await wikiAddCategory(newKb.id, { name: c.name, template_key: c.template_key || null, sort_order: c.sort_order });
                      createdCats.push({ name: c.name, template_key: c.template_key || undefined });
                    } catch (e) {
                      console.error('[创建KB] 单个分类创建失败:', c.name, e);
                    }
                  }
                } catch (e) {
                  console.error('[创建KB] AI设计分类整体失败:', e);
                }

                const fresh = await wikiListKbs().catch(() => null);
                if (fresh?.kbs) setKbs(fresh.kbs);

                setCreatingKb(null);
                updateActive((s) => ({
                  ...s,
                  kb_id: newKb.id,  // 绑定到新创建的 KB
                  source_type: "wiki",
                  msgs: [...s.msgs, {
                    role: "ai", source_type: "wiki", kb_title: newKb.title,
                    content:
                      `🎉 搞定！已为你创建「**${newKb.title}**」知识库\n\n` +
                      (createdCats.length > 0
                        ? `📂 分类 ${createdCats.length} 个：\n` +
                          createdCats.map((c) => `  • ${c.name}${c.template_key ? "（" + c.template_key + "）" : ""}`).join("\n") +
                          "\n\n📋 每个分类都配好了模板，可以直接往里面汇入资料！"
                        : "\n\n✅ 知识库已就绪，可以汇入资料了！") +
                      `\n\n💡 去「我的 → 知识库」看详情，或者直接在这里开始提问～`,
                  }],
                }));
              } catch (e: any) {
                updateActive((s) => ({
                  ...s,
                  msgs: [...s.msgs, {
                    role: "ai", source_type: "wiki",
                    content: `❌ 创建失败：${e?.message || "未知错误"}\n\n可以再试一次，或者去「我的 → 知识库」手动创建。`,
                  }],
                }));
                setCreatingKb(null);
              }
              setLoading(false);
              return;
            } else {
              // AI 正常聊天回复
              const reply = aiJson?.text || aiJson?.reply || aiRaw || "好的，请告诉我知识库名字和用途～";
              updateActive((s) => ({
                ...s,
                msgs: [...s.msgs, { role: "ai", source_type: "wiki", content: reply }],
              }));
              setLoading(false);
              return;
            }
          } catch (e) {
            // AI 挂了 → 降级到简单引导
            updateActive((s) => ({
              ...s,
              msgs: [...s.msgs, {
                role: "ai", source_type: "wiki",
                content: "好的！请直接告诉我：**知识库名字**和**它是干嘛的**，比如「路亚笔记，记录钓鱼经验和装备评测」",
              }],
            }));
            setLoading(false);
            return;
          }
        }  // 闭合 if (creatingKb !== null)

        // 知识库问答
        if (!active.kb_id) {
          updateActive((s) => ({
            ...s,
            msgs: [...s.msgs, { role: 'ai', content: '请先选择一个知识库 💡', sources: [], source_type: 'wiki' }],
          }));
          setLoading(false);
          return;
        }
        const forceCollect = !!forceImportMode || collectionMode;
        // forceImportMode(收集气泡点击) OR webSearchMode(用户开关) OR active.default_web_search(默认)
        const useWebSearch = forceCollect || webSearchMode;
        const kbTitle = activeKb?.title || '这个知识库';

        // ===== import_mode 判断：优先用参数，其次看 collectionMode state =====
        // forceImportMode 解决 React state 异步更新时序问题（气泡点击后立即 send）
        const importMode = forceCollect;
        // 收集模式是一次性的——用了就关
        if (collectionMode) setCollectionMode(false);

        const res = await askWiki(question, active.kb_id, recent, useWebSearch, importMode);
        let rawAnswer = res.answer;
        resSources = res.sources || [];
        resKbTitle = res.kb_title;

        // 解析 <<<SUGGEST>>> 标记：正文和推荐问题分开
        let parsedSugg: string[] = [];
        if (rawAnswer.includes('<<<SUGGEST>>>')) {
          const [body, suggPart] = rawAnswer.split('<<<SUGGEST>>>');
          rawAnswer = body.trim();
          parsedSugg = (suggPart || '')
            .trim()
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 3);
        }
        // 清理 AI 可能瞎编的 *** / --- / ___ 装饰线、— 汇总完成 — 标记
        rawAnswer = rawAnswer
          .replace(/^\s*\*+\s*$/gm, '')   // 整行都是 ***
          .replace(/^\s*-{3,}\s*$/gm, '') // 整行都是 ---
          .replace(/^\s*_{3,}\s*$/gm, '') // 整行都是 ___
          .replace(/^—\s*汇总完成\s*—\s*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')     // 多余空行合并
          .trim();
        // 没有 SUGGEST 标记就不存，显示时用按库生成的默认问题
        resAnswer = rawAnswer;

        // check-match low → 弹 ConfirmDialog（简化：直接在 AI 回答里告诉用户）
        if (res.need_confirm) {
          resAnswer = `⚠️ ${res.match_reason || '这个问题和当前知识库主题不太相关'}\n\n你要不要让我继续按「${kbTitle}」的分类和范本整理成可以汇入的内容？`;
        }

        // AI 回答里记住这次用的联网开关 + import_mode 相关字段
        updateActive((s) => ({
          ...s,
          msgs: [...s.msgs, {
            role: 'ai', content: resAnswer, sources: resSources, source_type: srcType,
            kb_title: resKbTitle, web_search: useWebSearch,
            can_save: res.can_save && !res.need_confirm,
            category_hint: res.category_hint,
            import_mode: importMode,
            need_confirm: res.need_confirm,
            match_reason: res.match_reason,
            suggest: parsedSugg,
          }],
        }));
        return;
      } else {
        // 日记问答（流式：边生成边显示；失败且没收到内容时退回非流式接口）
        const diaryWebSearch = webSearchMode;
        await streamDiaryAnswer(question, recent, diaryWebSearch);
        return;
      }
    } catch (e: any) {
      updateActive((s) => ({
        ...s,
        msgs: [...s.msgs, { role: 'ai', content: '抱歉，出了点问题：' + (e?.message || '请求失败'), sources: [] }],
      }));
    } finally {
      setLoading(false);
    }
  }

  // ===== 日记问答 · 流式 =====
  // 先插一条空的 AI 气泡，收到片段就往里追加（每帧最多刷新一次，避免长回答卡顿）
  const streamAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbortRef.current?.abort(), []);   // 离开页面时中止
  async function streamDiaryAnswer(
    question: string,
    recent: { role: "user" | "assistant"; content: string }[],
    diaryWebSearch: boolean,
  ) {
    const sessionId = activeId;
    const msgKey = Date.now() + Math.random();
    const patch = (fn: (m: Msg) => Msg) =>
      setSessions((list) => list.map((s) => s.id !== sessionId ? s : {
        ...s,
        msgs: s.msgs.map((m) => (m as any)._k === msgKey ? fn(m) : m),
      }));
    setSessions((list) => list.map((s) => s.id !== sessionId ? s : {
      ...s,
      msgs: [...s.msgs, { role: "ai", content: "", sources: [], source_type: "diary", web_search: diaryWebSearch, streaming: true, _k: msgKey } as Msg],
    }));

    let text = "";
    let pending = "";
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (!pending) return;
      text += pending; pending = "";
      const snapshot = text;
      patch((m) => ({ ...m, content: snapshot }));
    };
    const ctrl = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = ctrl;
    try {
      await askDiaryStream(question, recent, diaryWebSearch, {
        delta: (t) => {
          pending += t;
          if (!raf) raf = requestAnimationFrame(flush);
        },
        sources: (src) => patch((m) => ({ ...m, sources: src })),
      }, ctrl.signal);
      if (raf) cancelAnimationFrame(raf);
      flush();
      patch((m) => { const { _k, ...rest } = m as any; return { ...rest, streaming: false }; });
    } catch (e: any) {
      if (raf) cancelAnimationFrame(raf);
      flush();
      if (ctrl.signal.aborted) {
        patch((m) => { const { _k, ...rest } = m as any; return { ...rest, streaming: false, content: rest.content ? rest.content + "\n\n（已停止）" : "（已停止）" }; });
        return;
      }
      const received = e instanceof AskStreamError ? e.received : !!text;
      if (received) {
        // 已经显示了一部分 → 保留，提示中断
        patch((m) => { const { _k, ...rest } = m as any; return { ...rest, streaming: false, content: rest.content + "\n\n（回答中断了，可以再问我一次～）" }; });
        return;
      }
      // 一个字都没收到 → 退回原来的非流式接口
      try {
        const res = await askDiary(question, recent, diaryWebSearch);
        patch((m) => { const { _k, ...rest } = m as any; return { ...rest, streaming: false, content: res.answer, sources: res.sources || [] }; });
      } catch (e2: any) {
        patch((m) => { const { _k, ...rest } = m as any; return { ...rest, streaming: false, content: "抱歉，出了点问题：" + (e2?.message || "请求失败") }; });
      }
    } finally {
      if (streamAbortRef.current === ctrl) streamAbortRef.current = null;
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

  // ===== saveAiAnswerToWiki：把 AI 回答汇入知识库 =====
  async function saveAiAnswerToWiki(aiIdx: number) {
    if (loading) return;
    const cur = active;
    if (!cur || !cur.kb_id) return;
    const targetAi = cur.msgs[aiIdx];
    if (!targetAi || targetAi.role !== "ai") return;

    // 标记 importing
    updateActive((s) => {
      const newMsgs = [...s.msgs];
      newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: true };
      return { ...s, msgs: newMsgs };
    });

    try {
      // 两步：先插 wiki_sources，再调 ingest
      await wikiAddSourceText(cur.kb_id, targetAi.content, `小麦回答：${targetAi.content.slice(0, 20)}...`);
      await wikiIngestAll(cur.kb_id);

      updateActive((s) => {
        const newMsgs = [...s.msgs];
        newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: false, imported: true, can_save: false };
        return { ...s, msgs: newMsgs };
      });
    } catch {
      updateActive((s) => {
        const newMsgs = [...s.msgs];
        newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: false };
        return { ...s, msgs: newMsgs };
      });
    }
  }

  // ===== saveAiAnswerAsDiary：把日记 tab 的 AI 回答存成一条日记 =====
  async function saveAiAnswerAsDiary(aiIdx: number) {
    if (loading) return;
    const cur = active;
    if (!cur) return;
    const targetAi = cur.msgs[aiIdx];
    if (!targetAi || targetAi.role !== "ai") return;

    // 标记 importing
    updateActive((s) => {
      const newMsgs = [...s.msgs];
      newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: true };
      return { ...s, msgs: newMsgs };
    });

    try {
      // 🧠 智能匹配模板（和语音会计流程一致）
      let matchedTpl: string = "diary";
      try {
        const tplListResp = await listTemplates("mine");
        const tplList = tplListResp.templates || [];
        const tplDet = await detectTemplate(targetAi.content, undefined,
          tplList.map((t: any) => ({ id: t.id, name: t.name, description: t.description }))
        );
        matchedTpl = tplDet.templateId;
      } catch (e) {
        console.warn("[saveAiAnswerAsDiary] 模板匹配失败，默认 diary:", e);
      }

      const now = Date.now();
      const diaryData = {
        id: "diary_" + now,
        date: new Date().toISOString().slice(0, 10),
        title: targetAi.content.slice(0, 15) + (targetAi.content.length > 15 ? "…" : ""),
        templateId: matchedTpl,
        moodId: null as any,
        blocks: [{ id: "b_" + now, kind: "text" as const, content: targetAi.content }],
        createdAt: now,
        updatedAt: now,
      };
      await upsertDiary(diaryData);

      updateActive((s) => {
        const newMsgs = [...s.msgs];
        newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: false, imported: true, can_save: false };
        return { ...s, msgs: newMsgs };
      });
    } catch (err) {
      console.error("[saveAiAnswerAsDiary] 失败:", err);
      updateActive((s) => {
        const newMsgs = [...s.msgs];
        newMsgs[aiIdx] = { ...newMsgs[aiIdx], importing: false };
        return { ...s, msgs: newMsgs };
      });
      toast("存入日记失败: " + (err as Error)?.message);
    }
  }

  // ===== deleteAiMessage：删除单条 AI 消息（前端 UI 层） =====
  function deleteAiMessage(idx: number) {
    updateActive((s) => {
      const newMsgs = [...s.msgs];
      newMsgs.splice(idx, 1);
      return { ...s, msgs: newMsgs };
    });
  }

  // ===== openWikiPage：在弹窗中打开知识页面（不再跳转知识库 tab） =====
  async function openWikiPage(kbId: string, pageId: string) {
    try {
      const r = await wikiGetPage(kbId, pageId);
      setPageModal({ kbId, page: r.page });
    } catch (e) {
      console.error('openWikiPage failed', e);
    }
  }

  function newChat() {
    setCreatingKb(null);
    const s: Session = {
      id: uid(), title: "新对话", msgs: [], createdAt: Date.now(),
      source_type: active?.source_type || "diary",
      kb_id: undefined,  // 新建对话不绑定 KB，每次都是干净的
    };
    setSessions((list) => [s, ...list]);
    setActiveId(s.id);
    setShowHistory(false);
  }

  function switchSession(id: string) {
    setActiveId(id);
    setShowHistory(false);
  }

  function deleteSession(id: string) {
    chatDeleteSession(id).catch(() => {});  // 云端删，失败静默
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

  // 切换 source_type → 用已有的同类型空会话，没有才新建
  function setSourceTypeForActive(type: "diary" | "wiki") {
    setCreatingKb(null);
    setSessions((list) => {
      // 回到这个模式最近的一次对话（问知识库：回到最近用过的那个库）
      const recent = list
        .filter((s) => (s.source_type || "diary") === type)
        .sort((a, b) => ((b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)))[0];
      if (recent) {
        setActiveId(recent.id);
        return list;
      }
      // 新建
      const s: Session = {
        id: uid(),
        title: "新对话",
        msgs: [],
        createdAt: Date.now(),
        source_type: type,
        kb_id: undefined,
      };
      setActiveId(s.id);
      return [s, ...list];
    });
  }

  // 切换知识库 → 用已有的同 KB 空会话，没有才新建
  function setKbForActive(kbId: string) {
    setCreatingKb(null);
    setSessions((list) => {
      // 优先回到这个库最近的一次对话（旧版总是开一个新的空会话，聊到一半切走再切回来就找不到了）
      const recent = list
        .filter((s) => s.source_type === "wiki" && s.kb_id === kbId)
        .sort((a, b) => ((b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)))[0];
      if (recent) {
        setActiveId(recent.id);
        return list;
      }
      const s: Session = {
        id: uid(),
        title: "新对话",
        msgs: [],
        createdAt: Date.now(),
        source_type: "wiki",
        kb_id: kbId,
      };
      setActiveId(s.id);
      return [s, ...list];
    });
  }

  const activeType = active?.source_type || "diary";
  const activeKb = kbs.find((k) => k.id === active?.kb_id);
  const wikiSuggestions = useMemo(() => {
    const lastAi = [...(active?.msgs ?? [])].reverse().find((m) => m.role === "ai" && !m.streaming);
    if (lastAi?.suggest?.length) return lastAi.suggest.slice(0, 3);
    const name = activeKb?.title?.replace(/^\p{Extended_Pictographic}\s*/u, "") || "这个知识库";
    return [`「${name}」里都有什么？`, "最近收进来的是什么？", "帮我总结一下重点"];
  }, [active?.msgs, activeKb?.title]);

  return (
    <section className="flex flex-col relative h-full min-h-0">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`h-8 px-3 rounded-full text-xs border transition active:scale-95 shrink-0 ${showHistory ? "bg-paper-ink text-paper-bg border-paper-ink" : "bg-paper-card text-paper-ink2 border-paper-line/70 hover:text-paper-ink"}`}
            title="历史对话"
          >
            🕘 历史
          </button>
          {/* 问日记 / 问知识库 */}
          <div className="grid grid-cols-2 p-0.5 rounded-full bg-paper-line/40 shrink-0">
            <button
              onClick={() => setSourceTypeForActive("diary")}
              className={`h-7 px-3 text-xs rounded-full transition ${
                activeType === "diary" ? "bg-paper-card text-paper-ink font-medium shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              问日记
            </button>
            <button
              onClick={() => setSourceTypeForActive("wiki")}
              className={`h-7 px-3 text-xs rounded-full transition ${
                activeType === "wiki" ? "bg-paper-card text-paper-ink font-medium shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              问知识库
            </button>
          </div>
          {/* 知识库模式：KB 下拉 —— 永远不空 */}
          {activeType === "wiki" && (
            <select
              value={active?.kb_id || "__none__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v !== "__none__") { setKbForActive(v); }
              }}
              className="h-7 text-xs border border-paper-line/70 bg-paper-card rounded-full px-2 text-paper-ink2 min-w-0 max-w-[140px] focus:outline-none focus:border-paper-ink"
              title="选择知识库"
            >
              <option value="__none__" disabled>选知识库…</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.title}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={newChat}
          className="h-8 px-3 rounded-full text-xs bg-paper-card border border-paper-line/70 text-paper-ink2 hover:text-paper-ink transition active:scale-95 shrink-0"
          title="新建对话"
        >
          ＋ 新对话
        </button>
      </div>

      {/* 历史会话抽屉 —— 按当前模式过滤 */}
      {showHistory && (
        <div className="absolute top-[48px] left-0 right-0 bottom-0 z-10 bg-paper-bg/95 backdrop-blur-sm flex flex-col border-r border-paper-line">
          <div className="px-4 py-3 border-b border-paper-line text-xs text-paper-ink2 flex items-center justify-between">
            <span>全部对话（{sessions.filter((s) => s.msgs.length > 0).length}）</span>
            <button onClick={() => setShowHistory(false)} className="hover:text-paper-ink">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {(() => {
              // 所有会话按最近使用排序，每条带来源标签（日记 / 哪个知识库），不用先切模式才能找到
              const list = sessions
                .filter((s) => s.msgs.length > 0)
                .sort((a, b) => ((b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)));
              if (!list.length) return <div className="px-4 py-8 text-center text-xs text-paper-ink3">还没有对话</div>;
              return list.map((s) => {
                const kb = s.kb_id ? kbs.find((k) => k.id === s.kb_id) : null;
                const src = (s.source_type || "diary") === "wiki"
                  ? (kb ? (/^\p{Extended_Pictographic}/u.test(kb.title) ? kb.title : `📚 ${kb.title}`) : "📚 知识库")
                  : "📖 日记";
                return <SessionRow key={s.id} s={s} activeId={activeId} onSwitch={switchSession} onDelete={deleteSession} source={src} />;
              });
            })()}
          </div>
        </div>
      )}

      {/* 对话区 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        {active?.msgs.length === 0 && activeType === "diary" && (
          <div className="pt-6 flex flex-col items-center text-center">
            <Xiaomai mood={moodFor()} size={88} />
            <div className="mt-3 text-lg font-semibold text-paper-ink">嗨，我是小麦</div>
            <div className="mt-1 text-sm text-paper-ink2 max-w-xs">你写过的每一篇日记我都读过，想不起哪天的事，随时问我</div>
            {rememberLine && (
              <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-full px-3 py-1 max-w-full truncate">
                🌾 我记得：{rememberLine}
              </div>
            )}
            <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {(personalSuggestions.length ? personalSuggestions : SUGGESTIONS).map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="px-4 py-3 rounded-2xl bg-paper-card border border-paper-line/70 shadow-card text-sm text-paper-ink hover:shadow-cardHover active:scale-[0.99] transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}


        {/* 没选 KB 的空状态 —— KB 卡片列表 */}
        {active?.msgs.length === 0 && activeType === "wiki" && !activeKb && (
          <div className="space-y-3">
            <div className="pt-4 text-center">
              <div className="text-base font-semibold text-paper-ink">想问哪个知识库？</div>
              <div className="text-xs text-paper-ink2 mt-1">
                {kbs.length > 0 ? "选一个，我在里面帮你找" : "还没有知识库，去「回忆 → 知识」建一个吧"}
              </div>
              {kbs.length === 0 && (
                <button type="button" onClick={() => nav("/people")} className="mt-3 text-xs px-3 py-1.5 rounded-full bg-paper-accent text-white">去建知识库</button>
              )}
            </div>

            {kbs.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {kbs.map((kb) => (
                  <button
                    key={kb.id}
                    onClick={() => setKbForActive(kb.id)}
                    className="text-left rounded-2xl border border-paper-line/70 bg-paper-card shadow-card hover:shadow-cardHover px-4 py-3 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📁</span>
                      <span className="font-medium text-paper-ink truncate">{kb.title}</span>
                    </div>
                    {kb.description && (
                      <div className="text-[11px] text-paper-ink2 mt-1 line-clamp-2 pl-7">{kbDescText(kb.description)}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 首次对话：欢迎语 + 气泡 */}
        {active?.msgs.length === 0 && activeType === "wiki" && activeKb && (
          <div className="pt-4 text-center">
            {/* 官方库标题自带 emoji（「📚 红楼梦研究」），这里不再额外加，避免出现两个 📚 */}
            <div className="text-base font-semibold text-paper-ink">{/^\p{Extended_Pictographic}/u.test(activeKb.title) ? activeKb.title : `📚 ${activeKb.title}`}</div>
            {activeKb.description && <div className="text-xs text-paper-ink2 mt-1 max-w-sm mx-auto line-clamp-3">{kbDescText(activeKb.description)}</div>}
            <div className="text-xs text-paper-ink3 mt-2">问我这个知识库里的任何事</div>
          </div>
        )}

        {active?.msgs.map((m, i) => (
          <div key={i} className={`group flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : "animate-pop-in"}`}>
            {/* 头像：小麦（活的）/ 用户 */}
            {m.role === "user"
              ? <UserAvatar />
              : <div className="shrink-0 w-9 h-9 rounded-full bg-amber-50 border border-paper-line/70 flex items-center justify-center">
                  <Xiaomai live talking={!!m.streaming} mood={m.streaming && !m.content ? "thinking" : "happy"} size={32} />
                </div>}
            <div className={`min-w-0 flex-1 flex flex-col ${m.role === "user" ? "items-end pl-10" : "items-start pr-10"}`}>
            <div
              className={`max-w-full min-w-[3rem] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                m.role === "user"
                  ? "bg-paper-ink text-paper-bg rounded-br-md whitespace-pre-wrap"
                  : "bg-paper-card border border-paper-line/70 shadow-card text-paper-ink rounded-bl-md"
              }`}
            >
              {m.streaming && !m.content
                ? <span className="inline-flex items-center gap-2 text-paper-ink2"><Xiaomai mood="thinking" size={24} /> 小麦在翻日记…</span>
                : m.role === "ai"
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>{m.content}</ReactMarkdown>
                  : m.content}
              {m.streaming && m.content ? <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-paper-ink2/60 animate-pulse" /> : null}
              {m.sources?.length ? (
                <div className="mt-2 pt-2 border-t border-paper-line/60 space-y-1.5">
                  <div className="text-[11px] text-paper-ink3">
                    {m.source_type === "wiki" ? `来自 ${m.sources.length} 个知识页面` : `来自 ${m.sources.length} 篇日记`}
                  </div>
                  {m.source_type === "wiki"
                    ? // WikiSource 渲染（可点击跳转知识库页面）
                      (m.sources as WikiSource[]).map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            const kbId = active?.kb_id;
                            if (!kbId || !s.page_id) return;
                            openWikiPage(kbId, s.page_id);
                          }}
                          className="w-full text-left rounded-lg border border-paper-line/60 bg-paper-surface/40 px-2.5 py-1.5 text-[11px] text-paper-ink2 hover:bg-paper-surface hover:border-paper-accent/40 transition cursor-pointer"
                        >
                          <span className="text-paper-accent">📄 {s.title}</span>
                          {s.summary && <div className="mt-0.5 text-paper-ink2/70 truncate">{s.summary}</div>}
                        </button>
                      ))
                    : // DiarySource 渲染
                      (m.sources as DiarySource[]).map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => nav(`/editor/${s.diary_id}`)}
                          className="w-full text-left rounded-xl border border-paper-line/60 bg-paper-surface/60 px-3 py-2 hover:bg-paper-surface hover:border-paper-accent/40 transition"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-paper-accent font-medium">📖 {fmtMD(s.date) || "一篇日记"}</span>
                            <span className="text-paper-ink3">打开 ›</span>
                          </div>
                          {s.content && <div className="mt-0.5 text-[11px] leading-relaxed text-paper-ink2 line-clamp-2">{s.content}</div>}
                        </button>
                      ))}
                </div>
              ) : null}
              {m.role === "user" && (
                <RememberButton content={m.content} />
              )}
              {/* wiki 模式的 AI 回答底部：纯状态展示 */}
              {m.role === "ai" && m.web_search && !m.streaming && (
                <div className="mt-2">
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🌐 含联网信息</span>
                </div>
              )}
            </div>
            {/* AI 操作按钮：扁平文字按钮条（跟内容气泡/推荐气泡视觉区分开）*/}
            {m.role === "ai" && !m.streaming && !m.importing && !m.imported && (
              <div className="mt-1.5 flex items-center gap-3 px-1 text-[11px] text-paper-ink3">
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(m.content).then(() => toast("已复制", "ok")).catch(() => {}); }}
                  className="hover:text-paper-accent transition"
                >
                  复制
                </button>
                <span className="text-paper-line">·</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (m.source_type === "wiki") { retryWikiAnswer(i, m.web_search || false); return; }
                    // 日记：找到对应的提问，删掉这条回答后重新问
                    let q = "";
                    for (let j = i - 1; j >= 0; j--) if (active.msgs[j].role === "user") { q = active.msgs[j].content; break; }
                    if (!q) return;
                    updateActive((cur) => ({ ...cur, msgs: cur.msgs.filter((_, k) => k !== i && k !== i - 1) }));
                    setTimeout(() => send(q), 0);
                  }}
                  disabled={loading}
                  className="hover:text-paper-accent disabled:opacity-50 transition"
                >
                  重新回答
                </button>
                <span className="text-paper-line/60">·</span>
                {m.source_type === "wiki" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); saveAiAnswerToWiki(i); }}
                    disabled={loading || !active?.kb_id}
                    className="hover:text-emerald-600 disabled:opacity-50 transition"
                  >
                    收进知识库
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); saveAiAnswerAsDiary(i); }}
                    disabled={loading}
                    className="hover:text-emerald-600 disabled:opacity-50 transition"
                  >
                    存成日记
                  </button>
                )}
                <span className="text-paper-line/60">·</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAiMessage(i); }}
                  className="hover:text-red-500 transition"
                >
                  删除
                </button>
              </div>
            )}
            {m.role === "ai" && (m.importing || m.imported) && (
              <div className="mt-1 px-1">
                {m.importing && (
                  <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">📥 汇入中…</span>
                )}
                {m.imported && (
                  <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">✅ 已汇入</span>
                )}
              </div>
            )}
          </div>
            </div>
        ))}

        {loading && !active?.msgs.some((m) => m.streaming) && (
          <div className="flex justify-start">
            <div className="bg-paper-card border border-paper-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-paper-ink2">
              <span className="inline-flex items-center gap-2"><Xiaomai mood="thinking" size={24} /> 小麦在翻日记…</span>
            </div>
          </div>
        )}

        {/* 知识 tab 下气泡常驻：每次 AI 回答完都显示 */}
        {!loading && activeType === "wiki" && activeKb && (
          <div className="flex flex-wrap gap-2 py-3 px-1">
            {wikiSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-paper-line bg-paper-card text-paper-ink2 hover:bg-paper-line/40 transition"
              >
                {s}
              </button>
            ))}
            {/* 收集气泡 —— 永远在最后 */}
            <div className="relative">
              <button
                onClick={() => setCollectPopOpen((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
              >
                🧠 帮我收集新知识
              </button>
              {collectPopOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-paper-card border border-paper-line rounded-xl shadow-lg py-1.5 z-50 min-w-[180px]">
                  <button
                    onClick={() => {
                      setCollectPopOpen(false);
                      send('帮我收集一些适合这个知识库的内容', true);
                    }}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-paper-line/40 transition flex items-center gap-2"
                  >
                    <span className="text-emerald-500">⚡</span> 直接收集
                  </button>
                  <button
                    onClick={() => {
                      setCollectPopOpen(false);
                      setInput('帮我收集 ____ 的信息');
                    }}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-paper-line/40 transition flex items-center gap-2"
                  >
                    <span className="text-blue-500">✏️</span> 插入对话（可修改）
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="px-4 pt-2 pb-3 bg-paper-bg/90 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 items-center rounded-full bg-paper-card border border-paper-line/70 shadow-card pl-4 pr-1.5 py-1.5 focus-within:border-paper-accent transition"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeType === "wiki"
                ? (activeKb ? `问问「${activeKb.title}」…` : "先在上面选一个知识库")
                : "问问小麦，比如：上周我去哪了？"
            }
            className="flex-1 min-w-0 bg-transparent text-sm text-paper-ink placeholder:text-paper-ink3 outline-none py-1.5"
          />
          {/* 联网图标按钮（日记和知识 tab 都显示）*/}
          <button
            type="button"
            onClick={() => setWebSearchMode((v) => !v)}
            className={`shrink-0 h-8 px-2.5 rounded-full flex items-center gap-1 text-xs transition ${
              webSearchMode
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "text-paper-ink3 hover:text-paper-ink2 border border-transparent"
            }`}
            title={webSearchMode ? "联网搜索已开启（点一下关闭）" : (activeType === "wiki" ? "仅用知识库（点一下开启联网）" : "仅用日记（点一下开启联网）")}
          >
            🌐 <span>联网</span>
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="发送"
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base transition active:scale-95 ${
              input.trim() && !loading ? "bg-paper-accent text-white shadow-md" : "bg-paper-line/60 text-paper-ink3"
            }`}
          >
            ↑
          </button>
        </form>
      </div>

      {/* 知识页面弹窗 —— 替代跳转知识库 tab */}
      <Modal
        open={!!pageModal}
        onClose={() => setPageModal(null)}
        title={pageModal?.page.title}
        size="lg"
        scrollable
      >
        {pageModal && (
          <div className="wiki-md text-sm text-paper-ink px-5 py-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 text-paper-ink">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2 text-paper-ink">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1 text-paper-ink">{children}</h3>,
                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-1">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-paper-ink">{children}</strong>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-paper-line pl-3 my-1 text-paper-ink2 italic">{children}</blockquote>,
                code: ({ children }) => <code className="bg-paper-line/50 px-1 rounded text-xs font-mono">{children}</code>,
              }}
            >
              {pageModal.page.content.replace(/^\s*#\s+.+\n+/, '')}
            </ReactMarkdown>
          </div>
        )}
      </Modal>
    </section>
  );
}



