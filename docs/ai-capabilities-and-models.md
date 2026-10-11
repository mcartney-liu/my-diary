# MyDiary AI 能力全景与模型架构

> **文档性质**：概要设计文档（Overview Design）
> **最后更新**：2026-10-10
> **维护人**：开发团队
> **读者对象**：后端 / 前端 / 运维 —— 任何人排查 AI 问题、更换供应商、或新增 AI 场景时都要先看本文档

---

## 一、两条 AI 链路

MyDiary 的 AI 调用分成两条完全不同的链路，**互不干扰、各自独立降级**：

```
┌─────────────────────────────────────────────────────────────────┐
│                        MyDiary 前端                             │
│                                                                 │
│  ┌──────────────────────┐    ┌────────────────────────────┐    │
│  │  ① 前端直连链路       │    │  ② Worker 后端链路          │    │
│  │                      │    │                            │    │
│  │  src/ai.ts           │    │  前端 api.ts → fetch       │    │
│  │  callChatCompletion()│    │  → Worker 路由 → AI        │    │
│  │  → fetch Agnes API   │    │                            │    │
│  │  (绕过 Worker)        │    │  Worker:                  │    │
│  │                      │    │  index.js  callLLM()       │    │
│  │  代表场景：           │    │  wiki.js  wikiCallLLM()    │    │
│  │  · 语音快记           │    │  · 小麦 AI 助手问答        │    │
│  │  · AI 润色           │    │  · 知识库汇入              │    │
│  │  · 每日摘要           │    │  · 记忆提取               │    │
│  └──────────┬───────────┘    └──────────┬─────────────────┘    │
│             │                            │                      │
└─────────────┼────────────────────────────┼──────────────────────┘
              │                            │
              ▼                            ▼
   ┌──────────────────┐          ┌─────────────────────────┐
   │  Agnes AI         │          │  Worker 后端统一调度     │
   │  agnes-3.0-flash  │          │                         │
   │  (中转聚合)       │          │  callLLM:               │
   │                  │          │    Agnes 主 → Workers AI │
   │  ⚠️ 问题：         │          │                        │
   │  手机网络直连超时   │          │  wikiCallLLM:           │
   │  (Fetch aborted)  │          │    DeepSeek 主 → Workers │
   │                  │          │                        │
   │  无 fallback       │          │  embedding/rerank:     │
   │  (前端各自降级)     │          │    Workers AI 免费模型   │
   └──────────────────┘          └─────────────────────────┘
```

**为什么不统一走后端？**

> 历史原因——语音快记是 v0.4 加的，当时 Agnes 响应快、前端直连省一次 Worker 往返。后来知识库要强推理换了 DeepSeek 主模型，就没回头改日记链路。统一是未来可选项，不急。

---

## 二、模型清单

### 2.1 LLM 推理模型

| 模型 | 供应商 | 角色 | 用在哪 | 付费/免费 |
|---|---|---|---|---|
| **Agnes `agnes-3.0-flash`** | 聚合中转 | 日记侧主模型（聊天语气自然、便宜） | 前端直连 8 场景 + Worker 日记问答 + Worker Wiki 问答 | 付费 |
| **DeepSeek V4 Flash** `deepseek-v4-flash` | DeepSeek 官方 | 知识库侧主模型（结构化提取稳） | Worker 知识库汇入 / 实体生成 / 起标题 / 模板评估 | 付费 |
| **Workers AI `llama-3.1-8b-instruct-fp8`** | Cloudflare | 所有 Worker 场景的 fallback | Agnes/DeepSeek 挂了才用 | **免费** |

### 2.2 Embedding 模型

| 模型 | 供应商 | 用途 | 用在哪 | 付费/免费 |
|---|---|---|---|---|
| **Workers AI `@cf/baai/bge-m3`** | Cloudflare | 向量嵌入（RAG 检索） | Worker 日记 RAG + Wiki 汇入 + Wiki 问答 | **免费** |

### 2.3 Reranker 模型

| 模型 | 供应商 | 用途 | 用在哪 | 付费/免费 |
|---|---|---|---|---|
| **Workers AI `@cf/baai/bge-reranker-base`** | Cloudflare | RAG 重排序（智能精选） | Worker 日记 RAG + Wiki 问答 | **免费** |

### 2.4 额外的 Workers AI 直接调用

| 模型 | 用途 | 用在哪 |
|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct` | Worker 记忆提取（独立于 Agnes） | `index.js extractMemoryCandidates()` |

---

## 三、AI 场景完整清单

### 3.1 前端直连链路（11 个场景，8 个在用）

统一入口：`src/ai.ts → callChatCompletion()`
默认 Provider：Agnes `agnes-3.0-flash`（用户可在 ProfilePage 自定义）
超时：**30 秒**（2026-10-10 从 15 秒改的）

| # | 用户场景 | 触发入口 | 函数 | 实际在用 | 降级策略 |
|---|---|---|---|---|---|
| 1 | **语音快记 · 意图识别** | 麦克风 → 说完话 → 停止 | `detectTemplate()` | ✅ | 规则匹配（关键词） |
| 2 | **语音快记 · AI 润色** | 匹配到模板 → "用这个模板" | `polishTranscript()` | ✅ | 规则模板填充 |
| 3 | **手动写日记 · AI 润色** | EditorPage 选模板 → 保存时 | `polishTranscript()` | ✅ | 规则模板填充 |
| 4 | **纪念日 · AI 推断类型/日期** | 写了"5周年"、"从今天开始攒钱" | `inferMilestoneInfo()` | ✅ | 跳过 AI，让用户手动选 |
| 5 | **读书笔记 · AI 推荐** | EditorPage 编辑读书模板时 | `recommendBooks()` | ✅ | 返回空列表 |
| 6 | **读书笔记 · AI 起头** | 手动建读书笔记 | `kickoffBookNote()` | ✅ | 返回空对象 |
| 7 | **每日一句话摘要** | 首页连签条 | `summarizeDay()` | ✅ | 规则降级（模板标题复述检查） |
| 8 | **反馈 · AI 润色** | ProfilePage 提交反馈 | `polishFeedback()` | ✅ | 返回原文 |
| 9 | 写作提示（预留） | — | `suggestPrompts()` | ❌ | — |
| 10 | 日记摘要（预留） | — | `summarize()` | ❌ | — |
| 11 | 转写纠错（预留） | — | `correctTranscript()` | ❌ | — |

### 3.2 Worker 后端链路（14 个场景，全部在用）

#### A. 小麦 AI 助手（日记问答） — 统一走 `callLLM()`

路由：`POST /api/ai/ask`
主模型：Agnes `agnes-3.0-flash`（Worker 端，20 秒超时）
Fallback：Workers AI llama-3.1-8b-instruct-fp8
> ⚠️ **和前端直连用同一个 Agnes 模型，但走 Worker 中转更稳（多一层 Cloudflare 网络）**

| # | 用户场景 | 路由参数 | 主模型 | 辅助模型 |
|---|---|---|---|---|
| 12 | **日记 RAG 问答** | source_type=diary + 有日记关键词 | Agnes → Workers AI | bge-m3 嵌入 + bge-reranker 重排 |
| 13 | **闲聊/问候** | isGreeting() 命中 | Agnes → Workers AI | 无 |
| 14 | **通用常识问答** | 无日记关键词 | Agnes → Workers AI | 无 |
| 15 | **记忆提取** | 每次 AI 问答后异步 | — | llama-3.1-8b-instruct（直接 Workers AI，不走 Agnes） |

#### B. 知识库 AI — 统一走 `wikiCallLLM()`

路由：`/api/wiki/*`
主模型：**DeepSeek V4 Flash**（2 次重试 + 1.5s 间隔，20 秒超时）
Fallback：Workers AI llama-3.1-8b-instruct-fp8
> 为什么和 callLLM 用不同模型？知识库需要**强推理 + 结构化提取**（从一大段资料里抽人物/地点/填模板），DeepSeek V4 Flash 在此类任务上比 Agnes 稳。

| # | 用户场景 | 路由 | 主模型 | Fallback |
|---|---|---|---|---|
| 16 | **汇入资料**（日记/文本/文件 → 结构化页面） | `POST /api/wiki/kbs/:id/ingest` | DeepSeek V4 Flash | Workers AI llama |
| 17 | **AI 生成实体**（人物/地点/事件卡片） | `POST /api/wiki/kbs/:id/generate-entity` | DeepSeek V4 Flash | Workers AI llama |
| 18 | **AI 起标题** | `POST /api/wiki/suggest-title` | DeepSeek V4 Flash | Workers AI llama |
| 19 | **模板匹配评估** | `POST /api/wiki/:kbId/check-match` | DeepSeek V4 Flash | Workers AI llama |
| 20 | **知识库页面向量**（汇入末尾） | 同上流程 | — | bge-m3 嵌入 |

#### C. 知识库问答 — 走 `callLLM()`（不是 wikiCallLLM！）

路由：`POST /api/ai/ask` + source_type=wiki
主模型：**Agnes**（和日记问答一致，不是 DeepSeek）

| # | 用户场景 | 主模型 | 辅助模型 |
|---|---|---|---|
| 21 | **知识库 RAG 问答** | Agnes → Workers AI | bge-m3 嵌入 + bge-reranker 重排 |

> 为什么 Wiki 问答和汇入用不同 LLM？汇入需要强推理（抽实体），问答需要自然对话（Agnes 聊天语气好）。这个选择的正确性 **尚未验证**，有争议。

---

## 四、两条 Worker LLM 调用函数对比

| 维度 | `callLLM()`（index.js） | `wikiCallLLM()`（wiki.js） |
|---|---|---|
| 主模型 | Agnes `agnes-3.0-flash` | DeepSeek V4 Flash |
| 主模型配置 | Worker env `AGNES_ENDPOINT` + `AGNES_API_KEY` | Worker env `DEEPSEEK_API_KEY` + 硬编码 endpoint |
| Fallback | Workers AI llama-3.1-8b-instruct-fp8 | Workers AI llama-3.1-8b-instruct-fp8 |
| 超时 | 20 秒 | 20 秒 |
| 重试 | ❌ 无 | ✅ 2 次（间隔 1.5s） |
| 调用日志 | ❌ 用 console.log/warn | ✅ 每次 LLM 调用都 `dblog` 写 wiki_debug_log |
| 日志 tag | — | `ingest`（LLM_ENV / LLM_DEEPSEEK_OK / LLM_DEEPSEEK_EXCEPTION 等） |
| 最大 tokens | 500 左右（askDiary 不同场景不同） | 4096（知识库需要长输出） |
| 温度 | 0.7（聊天自然） | 0.1（结构化提取稳定） |
| 用在哪 | 日记问答 + Wiki 问答 + 闲聊 + 常识 | 知识库汇入 + 实体生成 + 起标题 + 模板评估 |

---

## 五、环境变量配置

### Worker wrangler.toml secrets

| Secret | 用在 | 值 |
|---|---|---|
| `AGNES_ENDPOINT` | `callLLM()` | `https://api.agnes-ai.cn/v1/chat/completions` |
| `AGNES_API_KEY` | `callLLM()` | `sk-vgf79jNx...Nb2UOQ4` |
| `DEEPSEEK_API_KEY` | `wikiCallLLM()` | DeepSeek 官方 API Key |
| Workers AI 内置 | 全部 `env.AI.run()` | Cloudflare 账号绑定，无需额外 secret |

### 前端

| 位置 | 值 |
|---|---|
| `src/ai.ts DEFAULT_PROVIDER` | Agnes `agnes-3.0-flash` + 同上 API Key（**硬编码在源码里**） |
| ProfilePage AI 设置 | 用户可自定义（存在 localStorage） |

---

## 六、故障排查指南

### 现象：语音快记卡在"帮你琢磨..."

**最可能原因**：前端直连 Agnes 超时（15→30 秒）

**排查步骤**：
1. 打开浏览器 DevTools → Network，搜 `agnes-ai.cn`，看 status 和耗时
2. Console 搜 `[ai] detectTemplate` 看有没有降级日志
3. 已在 devtools Console 显示具体错误（`Fetch is aborted` / `network error` 等）

### 现象：小麦 AI 助手问答超时 / 500

**最可能原因**：Agnes 挂了 → Workers AI fallback 慢

**排查步骤**：
1. 查 Worker 日志（`wrangler tail` 或 `wiki_debug_log`）
2. `console.warn('[callLLM] agnes 失败，fallback:')` 会出现在 Worker stdout
3. 如果 Agnes 和 Workers AI 都挂了 → 全线 AI 崩

### 现象：知识库汇入停在"处理中"

**最可能原因**：DeepSeek 超时 → Workers AI fallback 极慢（30-60 秒/批）

**排查步骤**：
1. 查 `wiki_debug_log`：`SELECT tag, msg FROM wiki_debug_log WHERE tag='ingest' AND ts > ? ORDER BY ts DESC`
2. 看有没有 `LLM_DEEPSEEK_OK` → 正常；`LLM_DEEPSEEK_EXCEPTION` → 查 msg 字段；`LLM_FALLBACK_WORKERS` → 正在用慢的 fallback

### 现象：知识库问答结果差 / 答非所问

**可能原因**：Wiki 问答用 Agnes，汇入用 DeepSeek，两边 prompt 风格不一致

**排查步骤**：对比 `handleWikiAsk` 和 `handleWikiIngestAll` 的 system prompt

---

## 七、已知设计债务

| # | 债务 | 影响 | 建议 |
|---|---|---|---|
| 1 | **前端直连 Agnes（绕过 Worker）** | 手机网络直连容易超时（Fetch aborted） | 把 8 个前端场景改成调 Worker 新路由 `/api/ai/detect-template`、`/api/ai/polish` 等 |
| 2 | **两套 LLM 选择不统一**（callLLM=Agnes / wikiCallLLM=DeepSeek） | 故障排查麻烦 | 不急，两家 = 线上双保险。等一家明显变慢/停服再统一 |
| 3 | **callLLM 没有 dblog** | 日记问答出问题只能翻 Cloudflare 日志 | 给 callLLM 补上 dblog，和 wikiCallLLM 对齐 |
| 4 | **callLLM 没有重试** | Agnes 偶发网络抖动就直接 fallback Workers AI | 加上，和 wikiCallLLM 对齐（2 次重试） |
| 5 | **前端 API Key 硬编码** | 任何前端代码泄露 = Agnes 被盗用 | 改为 Worker 代理，前端不直接持有 API Key |
| 6 | **Agent 身份暴露禁令** | system prompt 里反复写"不能说自己是 AI"，但有用户就爱问 | 可以简化 system prompt，信任模型遵循 |

---

## 八、扩展清单（新增 AI 场景时要做什么）

1. **先判断走哪条链路**——前端直连（快但不稳）还是 Worker 中转（稳但慢半拍）
2. **如果走 Worker**：用 `callLLM()` 还是 `wikiCallLLM()`？需要强推理 → wikiCallLLM（DeepSeek）；需要聊天自然 → callLLM（Agnes）
3. **加 dblog**——Worker 里的 AI 调用必须写 `wiki_debug_log`，格式参考 wikiCallLLM
4. **必须有降级**——任何 AI 调用都不能让整个流程炸掉，要有 fallback 逻辑
5. **更新本文档**——新增场景后补到第三部分的清单里
