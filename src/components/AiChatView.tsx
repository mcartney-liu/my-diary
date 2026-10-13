import { useState, useRef, useEffect, useMemo } from "react";
import { askDiary, askWiki, extractMemory, wikiListKbs, wikiAddKb, wikiAddCategory, wikiAIDesignCategories, wikiOptimizeDescription, chatListSessions, chatUpsertSessions, chatDeleteSession, wikiAddSourceText, wikiIngestAll, wikiGetPage, type WikiKB, type WikiPage } from "../api";
import Modal from "./Modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { callChatCompletion, getAiProvider } from "../ai";
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
  // import_mode 相关
  can_save?: boolean;         // 这条 AI 回答可以汇入知识库
  category_hint?: string;     // 推荐汇入的分类
  import_mode?: boolean;      // 这条回答是否来自 import_mode 流程
  need_confirm?: boolean;     // check-match low，需要用户确认
  match_reason?: string;
  importing?: boolean;        // 汇入中
  imported?: boolean;         // 已汇入
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
      title="小麦 会把这句话解析成简洁记忆存下来"
    >
      {saved ? `💾 已记住：${memContent || ""} 🌟` : saving ? "解析并保存中…" : "💾 记住这句话"}
    </button>
  );
}

function SessionRow({ s, activeId, onSwitch, onDelete }: { s: Session; activeId: string; onSwitch: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div
      onClick={() => onSwitch(s.id)}
      className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
        s.id === activeId ? "bg-paper-line/60" : "hover:bg-paper-surface"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-paper-ink truncate flex items-center gap-1.5">
          <span className="text-[11px] opacity-70 shrink-0">
            {(s.source_type || "diary") === "wiki" ? "🌳" : "📖"}
          </span>
          {s.title || "新对话"}
        </div>
        <div className="text-[11px] text-paper-ink2 mt-0.5 truncate">
          {s.msgs.length} 条 · {new Date(s.createdAt).toLocaleString()}
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
  // AI 气泡操作菜单：点哪个 AI 气泡就浮出菜单（汇入/删除）
  const [activeMsgIdx, setActiveMsgIdx] = useState<number | null>(null);
  // 收集模式：用户手动开启的收集并汇入模式（知识 tab 才显示）
  const [collectionMode, setCollectionMode] = useState(false);
  // 收集气泡弹层开关
  const [collectPopOpen, setCollectPopOpen] = useState(false);
  // AI 推荐的 3 个后续问题
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // 知识页面弹窗：点击引用链接或 [[xxx]] 时打开
  const [pageModal, setPageModal] = useState<{ kbId: string; page: WikiPage } | null>(null);
  // 会话级联网开关：控制后续所有知识 tab 提问
  const [webSearchMode, setWebSearchMode] = useState(false);
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
          kb_id: cs.kb_id, msgs: cs.msgs, createdAt: cs.createdAt,
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
      localStorage.setItem(keys.sessions, JSON.stringify(nonEmpty));
      localStorage.setItem(keys.active, activeId);

      // debounce 500ms 同步云端
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        chatUpsertSessions(nonEmpty.map(s => ({
          id: s.id, title: s.title, source_type: s.source_type || "diary",
          kb_id: s.kb_id, msgs: s.msgs, createdAt: s.createdAt, updatedAt: Date.now(),
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
    setSessions((list) => list.map((s) => (s.id === activeId ? updater(s) : s)));
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
                  console.log('[创建KB] AI设计分类返回:', r);
                  for (const c of r.categories) {
                    try {
                      const result = await wikiAddCategory(newKb.id, { name: c.name, template_key: c.template_key || null, sort_order: c.sort_order });
                      console.log('[创建KB] 分类创建结果:', c.name, result);
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
        const useWebSearch = forceCollect || webSearchMode || !!active.default_web_search;
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
        // 如果没有 SUGGEST 标记（老模型/兜底），用默认气泡
        if (parsedSugg.length === 0) {
          parsedSugg = ["这个知识库有哪些内容？", "帮我总结一下", "有什么分类？"];
        }
        setSuggestions(parsedSugg);
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
          }],
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
      await wikiAddSourceText(cur.kb_id, targetAi.content, `小麦AI回答：${targetAi.content.slice(0, 20)}...`);
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

  // ===== deleteAiMessage：删除单条 AI 消息（前端 UI 层） =====
  function deleteAiMessage(idx: number) {
    updateActive((s) => {
      const newMsgs = [...s.msgs];
      newMsgs.splice(idx, 1);
      return { ...s, msgs: newMsgs };
    });
    setActiveMsgIdx(null);
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
      // 找一个空的、同类型的会话复用
      const existingEmpty = list.find(s => s.msgs.length === 0 && s.source_type === type);
      if (existingEmpty) {
        setActiveId(existingEmpty.id);
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
      const existingEmpty = list.find(s => s.msgs.length === 0 && s.source_type === "wiki" && s.kb_id === kbId);
      if (existingEmpty) {
        setActiveId(existingEmpty.id);
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

  // 进入引导创建 KB 模式 → 新开空会话 + collecting 状态
  function startCreateKb() {
    setCreatingKb("collecting");
    const s: Session = {
      id: uid(),
      title: "新对话",
      msgs: [],
      createdAt: Date.now(),
      source_type: "wiki",
      kb_id: undefined,
    };
    setSessions((list) => [s, ...list]);
    setActiveId(s.id);
  }

  // 用户在空状态点了虚线"创建新知识库"按钮 → 追加引导气泡
  function appendCreatePrompt() {
    updateActive((s) => ({
      ...s,
      msgs: [...s.msgs, {
        role: "ai", source_type: "wiki",
        content: "好呀！📚\n\n告诉我你想建个什么样的知识库：\n• **名字**叫什么？（比如：我的路亚笔记）\n• 主要**用来记录什么**？（比如：钓法技巧、装备评测、钓点分享）\n\n直接一句话说就行，比如：「路亚笔记，记录钓鱼经验和装备评测」",
      }],
    }));
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
            className="text-xs px-2 py-1 rounded-full border border-paper-line bg-paper-card text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95 shrink-0"
            title="历史对话"
          >
            ☰
          </button>
          {/* source_type 切换器 */}
          <div className="flex items-center bg-paper-bg rounded-full px-0.5 py-0.5 border border-paper-line shrink-0">
            <button
              onClick={() => setSourceTypeForActive("diary")}
              className={`text-[11px] px-2 py-0.5 rounded-full transition ${
                activeType === "diary" ? "bg-paper-card text-paper-ink shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              📖 日记
            </button>
            <button
              onClick={() => setSourceTypeForActive("wiki")}
              className={`text-[11px] px-2 py-0.5 rounded-full transition ${
                activeType === "wiki" ? "bg-paper-card text-paper-ink shadow-sm" : "text-paper-ink2 hover:text-paper-ink"
              }`}
            >
              🌳 知识
            </button>
          </div>
          {/* 知识库模式：KB 下拉 —— 永远不空 */}
          {activeType === "wiki" && (
            <select
              value={creatingKb !== null && creatingKb !== "done" ? "__create__" : (active?.kb_id || "__none__")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__create__") { startCreateKb(); }
                else if (v && v !== "__none__") { setKbForActive(v); }
              }}
              className="text-[11px] border border-paper-line bg-paper-card rounded-full px-2 py-0.5 text-paper-ink2 min-w-0 max-w-[160px] focus:outline-none focus:border-paper-ink"
              title="选择知识库"
            >
              <option value="__none__" disabled>选知识库…</option>
              <option value="__create__">🆕 + 创建知识库</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.title}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={newChat}
          className="text-xs px-2.5 py-1 rounded-full border border-paper-line bg-paper-card text-paper-ink2 hover:bg-paper-line/40 transition active:scale-95 shrink-0"
          title="新建对话"
        >
          ＋
        </button>
      </div>

      {/* 历史会话抽屉 —— 按当前模式过滤 */}
      {showHistory && (
        <div className="absolute top-[48px] left-0 right-0 bottom-0 z-10 bg-paper-bg/95 backdrop-blur-sm flex flex-col border-r border-paper-line">
          <div className="px-4 py-3 border-b border-paper-line text-xs text-paper-ink2 flex items-center justify-between">
            <span>
              {activeType === "diary" ? "📖 日记对话" : "🌳 知识对话"}
              （{sessions.filter((s) => (s.source_type || "diary") === activeType && s.msgs.length > 0).length}）
            </span>
            <button onClick={() => setShowHistory(false)} className="hover:text-paper-ink">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {(() => {
              // 按当前模式过滤 + 过滤空会话
              const filtered = sessions.filter((s) => (s.source_type || "diary") === activeType && s.msgs.length > 0);

              // wiki 模式 → 按 kb_id 分组
              if (activeType === "wiki") {
                const groups: Record<string, typeof sessions> = {};
                for (const s of filtered) {
                  const key = s.kb_id || "__none__";
                  (groups[key] = groups[key] || []).push(s);
                }
                // 当前 KB 分组置顶，其余按标题字母序
                const currentKbId = active?.kb_id;
                const sortedKeys = Object.keys(groups).sort((a, b) => {
                  if (a === currentKbId) return -1;
                  if (b === currentKbId) return 1;
                  const ka = a === "__none__" ? "zzz" : (kbs.find((k) => k.id === a)?.title || "");
                  const kb = b === "__none__" ? "zzz" : (kbs.find((k) => k.id === b)?.title || "");
                  return ka.localeCompare(kb);
                });
                return sortedKeys.flatMap((key) => {
                  const kb = key === "__none__" ? null : kbs.find((k) => k.id === key);
                  const list = groups[key];
                  return [
                    <div key={"g-" + key} className="px-4 py-1.5 text-[11px] text-paper-ink2 uppercase tracking-wider bg-paper-line/30 sticky top-0 z-10">
                      {kb ? `📚 ${kb.title}` : "⚠️ 未绑定知识库"}
                    </div>,
                    ...list.map((s) => (
                      <SessionRow key={s.id} s={s} activeId={activeId} onSwitch={switchSession} onDelete={deleteSession} />
                    )),
                  ];
                });
              }

              // diary 模式 → 平铺
              return filtered.map((s) => <SessionRow key={s.id} s={s} activeId={activeId} onSwitch={switchSession} onDelete={deleteSession} />);
            })()}
          </div>
        </div>
      )}

      {/* 对话区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {active?.msgs.length === 0 && activeType === "diary" && (
          <>
            <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
              💬 这是小麦，你的智能助手。写下的每一篇日记都可以被我找到。试试问点什么吧～
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

        {/* 创建知识库专属空状态 */}
        {active?.msgs.length === 0 && activeType === "wiki" && creatingKb === "collecting" && (
          <div className="space-y-3">
            <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line whitespace-pre-wrap">
              📚 **创建新知识库**

告诉我这几个信息，我全程帮你定：
1. **你是什么职业/职位？**（比如：产品经理、钓鱼爱好者、健身教练）
2. **知识库叫什么名字？**（比如：我的路亚笔记）
3. **里面包含什么？想解决什么问题？**（比如：记录钓鱼经验、装备评测，解决选装备纠结）

直接一句话说就行～
            </div>
            <button
              onClick={appendCreatePrompt}
              className="w-full rounded-xl border border-paper-accent/30 bg-paper-accent/5 hover:bg-paper-accent/10 px-4 py-3 text-sm text-paper-accent font-medium transition cursor-pointer"
            >
              💬 开始对话引导
            </button>
          </div>
        )}

        {/* 没选 KB 的空状态 —— KB 卡片列表 */}
        {active?.msgs.length === 0 && activeType === "wiki" && !activeKb && creatingKb === null && (
          <div className="space-y-3">
            <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
              🌳 我是小麦，你的知识小助手 📚
              {kbs.length > 0
                ? `\n\n已接入 **${kbs.length}** 个知识库，选一个开始提问，或者创建新知识库（通过上方下拉框选择「🆕 + 创建知识库」）吧～`
                : "\n\n还没有知识库呢，通过上方下拉框选择「🆕 + 创建知识库」来创建第一个吧！"}
            </div>

            {kbs.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {kbs.map((kb) => (
                  <button
                    key={kb.id}
                    onClick={() => setKbForActive(kb.id)}
                    className="text-left rounded-xl border border-paper-line bg-paper-card hover:border-paper-accent/40 hover:bg-paper-surface px-4 py-3 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📁</span>
                      <span className="font-medium text-paper-ink truncate">{kb.title}</span>
                    </div>
                    {kb.description && (
                      <div className="text-[11px] text-paper-ink2 mt-1 line-clamp-2 pl-7">{kb.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 首次对话：欢迎语 + 气泡 */}
        {active?.msgs.length === 0 && activeType === "wiki" && activeKb && (
          <div className="text-paper-ink2 text-sm leading-relaxed bg-paper-surface rounded-xl p-4 border border-paper-line">
            🌳 我在「**{activeKb.title}**」知识库里，问我点什么吧～
            {activeKb.description && `\n\n${activeKb.description}`}
          </div>
        )}

        {active?.msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              onClick={() => {
                // 知识 tab 的 AI 回答：点一下浮出操作菜单；日记 tab 的 AI 回答不动
                if (m.role === "ai" && m.source_type === "wiki") {
                  setActiveMsgIdx((prev) => prev === i ? null : i);
                }
              }}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-paper-ink text-paper-bg rounded-br-sm"
                  : "bg-paper-card border border-paper-line text-paper-ink rounded-bl-sm"
              } ${m.role === "ai" && m.source_type === "wiki" ? "cursor-pointer hover:border-paper-accent/40 transition" : ""}`}
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
                            openWikiPage(kbId, s.page_id);
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
                          <div className="px-2.5 py-2 text-[11px] leading-relaxed text-paper-ink2 border-t border-paper-line/40 bg-paper-card/60">
                            {s.content}
                          </div>
                        </details>
                      ))}
                </div>
              ) : null}
              {m.role === "user" && (
                <RememberButton content={m.content} />
              )}
              {/* wiki 模式的 AI 回答底部：纯状态展示 */}
              {m.role === "ai" && m.source_type === "wiki" && !m.importing && !m.imported && (
                <div className="mt-2 pt-2 border-t border-paper-line/60">
                  {m.web_search ? (
                    <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">🔎 联网搜索 + 知识库</span>
                  ) : (
                    <span className="text-[10px] text-paper-ink2 bg-paper-surface/60 px-1.5 py-0.5 rounded">� 仅知识库</span>
                  )}
                </div>
              )}
            </div>
            {/* AI 气泡操作菜单：点击浮出 */}
            {activeMsgIdx === i && m.role === "ai" && m.source_type === "wiki" && !m.importing && !m.imported && (
              <div className="mt-1 flex items-center gap-1.5 px-1 flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); retryWikiAnswer(i, m.web_search || false); setActiveMsgIdx(null); }}
                  disabled={loading}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-paper-line text-paper-ink2 bg-paper-card hover:bg-paper-surface disabled:opacity-50 transition"
                >
                  🔄 重新回答
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); saveAiAnswerToWiki(i); setActiveMsgIdx(null); }}
                  disabled={loading || !active?.kb_id}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition"
                >
                  📥 汇入知识库
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAiMessage(i); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition"
                >
                  🗑️ 删除
                </button>
              </div>
            )}
            {activeMsgIdx === i && m.role === "ai" && (m.importing || m.imported) && (
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
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-paper-card border border-paper-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-paper-ink2">
              <span className="inline-block animate-pulse">思考中…</span>
            </div>
          </div>
        )}

        {/* 知识 tab 下气泡常驻：每次 AI 回答完都显示 */}
        {!loading && activeType === "wiki" && activeKb && (
          <div className="flex flex-wrap gap-2 py-3 px-1">
            {(suggestions.length > 0 ? suggestions : ["这个知识库有哪些内容？", "帮我总结一下", "有什么分类？"]).slice(0, 3).map((s) => (
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
      <div className="px-5 py-3 border-t border-paper-line bg-paper-surface/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 items-center"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeType === "wiki" ? (webSearchMode ? "联网 + 知识库回答…" : "仅知识库回答…") : "问点什么…"}
            className="flex-1 px-4 py-2.5 rounded-full border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-ink/50"
          />
          {/* 知识 tab：联网图标按钮 */}
          {activeType === "wiki" && (
            <button
              type="button"
              onClick={() => setWebSearchMode((v) => !v)}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border transition text-lg ${
                webSearchMode
                  ? "border-blue-300 bg-blue-50 text-blue-500 hover:bg-blue-100"
                  : "border-paper-line bg-paper-card text-paper-ink3 hover:text-paper-ink2 hover:bg-paper-surface"
              }`}
              title={webSearchMode ? "联网搜索已开启（点一下关闭）" : "仅用知识库（点一下开启联网）"}
            >
              🌐
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-full bg-paper-ink text-paper-bg text-sm disabled:opacity-40 hover:opacity-80 transition"
          >
            发送
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



