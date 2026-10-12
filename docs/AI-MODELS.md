# AI 模型清单（MyDiary）

> 📅 核对时间：2026-10-10 ｜ 方法：全目录递归 grep（`src/` `workers/src/` `functions/`）+ 逐处读代码
> ⚠️ 本清单由代码取证得出，**不是猜测**。改动模型后请同步更新本文档。

---

## 一、结论速查（一句话）

| 归属 | 主力模型 | 降级 |
|---|---|---|
| **知识库模块**（`workers/src/wiki.js`） | 🔵 **DeepSeek `deepseek-v4-flash`** | Meta Llama 3.1 8B |
| **主服务**（`workers/src/index.js`） | 🟡 **Agnes `agnes-3.0-flash`** | Meta Llama 3.1 8B |
| **前端功能**（`src/ai.ts` 8 处） | ⚪ **用户自填 API**（默认 Agnes） | 无 |
| 向量检索 / 重排 | 智源 bge 系列 | 无 |

**没有用 GPT / Claude / 通义 / Qwen / Whisper。**

---

## 二、四个模型详解

### 1. DeepSeek `deepseek-v4-flash` —— 知识库专用主力

**出处**：`workers/src/wiki.js:34-36`

```js
const WIKI_LLM_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
```

| 项 | 说明 |
|---|---|
| 归属 | 深度求索（DeepSeek），国内直连无需代理 |
| 用途 | 知识库：资料→实体切分、自动分类、生成页面、记忆提取、问答 |
| 降级 | `@cf/meta/llama-3.1-8b-instruct-fp8`（Cloudflare Workers AI） |
| 重试 | **2 次**（应对 429 限流，间隔 1.5s），见 `wiki.js:43-48` |
| 依赖环境变量 | `DEEPSEEK_API_KEY`（`wiki.js:39`） |

**⚠️ 风险**：Llama 3.1 8B 的中文能力明显弱于 DeepSeek。若 `DEEPSEEK_API_KEY` 未配或额度耗尽，知识库质量会显著下降。

### 2. Agnes `agnes-3.0-flash` —— 主服务 + 前端默认值

**出处**：`workers/src/index.js:1456`、`src/ai.ts:95`

```js
// workers/src/index.js
const LLM_MODEL_NAME = 'agnes-3.0-flash';
// src/ai.ts:95
model: "agnes-3.0-flash"
```

| 项 | 说明 |
|---|---|
| 归属 | **第三方聚合平台**（不是模型厂商，是转发层） |
| 用途 | 每日总结、AI 问答、记忆提取；前端 8 处功能的默认值 |
| 降级 | `@cf/meta/llama-3.1-8b-instruct-fp8` |
| ⚠️ 待确认 | **Agnes 背后实际是哪个上游模型，代码里看不出来**，需问 Web 团队或在设置页看 endpoint 域名 |

### 3. Meta Llama 3.1 8B —— 兜底

**出处**：`workers/src/index.js:1455`、`workers/src/wiki.js:35`

```js
const LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
```

Cloudflare Workers AI 托管，**免费额度内**，作为两个模块的共同降级。

### 4. 智源 BGE 系列 —— 向量与重排

| 模型 | 用途 | 出处 |
|---|---|---|
| `@cf/baai/bge-m3` | 文本→向量，RAG 检索（5 处） | `index.js:1454` |
| `@cf/baai/bge-reranker-base` | 检索结果重排 | `index.js:1713` `1820` |

---

## 三、按「用户在做什么」对照

### 后端 · 主服务（Agnes 优先，失败降级 Llama）

| 用户场景 | 代码位置 | 模型调用 |
|---|---|---|
| 每日总结 / 每日一句 | `index.js:1578` | `callLLM(600 tokens)` |
| 记忆提取 | `index.js:1659` | `callLLM(500 tokens)` |
| 知识库/全局问答 | `index.js:1887` | `callLLM(800 tokens)` |
| RAG 兜底回答 | `index.js:1527` | `callLLM(256 tokens)` |

### 后端 · 知识库（DeepSeek 优先，失败降级 Llama）

| 用户场景 | 代码位置 | 模型调用 |
|---|---|---|
| 资料 → 实体切分 | `wiki.js:626` | `wikiCallLLM(4096)` |
| 自动分类 / 生成页面 | `wiki.js:970` | `wikiCallLLM` |
| 记忆提取 | `wiki.js:1637` `1666` | `wikiCallLLM` |

### 前端（`src/ai.ts` 10 处，走用户自填 API）

| 用户场景 | 函数 | 备注 |
|---|---|---|
| 语音转写纠错 | `correctTranscript:156` | |
| 日记润色 | `polishTranscript:225` | |
| 推荐提示词 | `suggestPrompts:416` | |
| 生成总结 | `summarize:443` | |
| 编辑器小麦气泡 / 模板识别 | `detectTemplate:709` | v0.5.10 新增 |
| 纪念日与倒计时推断 | `inferMilestoneInfo:899` | |
| 每日总结 | `summarizeDay:1031` | **唯一有 localStorage 缓存 + 脏缓存清洗**（见下） |
| 荐书 | `recommendBooks:1177` | |
| 读书笔记开场 | `kickoffBookNote:1305` | |
| 反馈自动分类 | `polishFeedback:1379` | |

**机制**（`ai.ts:10` 注释 + `99-118` 代码）：
```
用户在设置页填 endpoint + model + apiKey → 存 localStorage
getAiProvider() 读取；无配置时返回 DEFAULT_PROVIDER（model = agnes-3.0-flash）
```

**`summarizeDay` 特殊说明**（`ai.ts:1031-1040`）：
- 有 localStorage 缓存，key = `mydiary.summary.v2.<date>`
- 会**清洗脏缓存**：命中 `badPatterns`（含 `reason` / `error` / 各模板标题复述）或长度 < 8 一律重算
- 这解释了 `ProfilePage.tsx:957` 记录的历史坑：「每日一句永远走兜底 —— `callChatCompletion` 写死 `json_object` 强制返回 JSON → 每次命中错误兜底」

⚠️ **用户没配 API Key 时，这 10 个功能全部失效。**

### ❌ 不调模型的（纯本地规则，别误判）

| 功能 | 代码 | 原理 |
|---|---|---|
| 心情判断 | `ai.ts:303 detectMoodByKeywords` | 关键词表匹配（"开心/高兴/快乐"…） |
| 模板快速匹配 | `ai.ts:642 quickRuleMatch` | 本地打分 |

---

## 四、DeepSeek 埋点与运维排查

`wiki.js` 写库埋点（可用 D1 查询），`DEPLOY.md:499-506` 有说明：

| 埋点名 | 含义 |
|---|---|
| `LLM_ENV` | 检查 DeepSeek 配置（hasEndpoint / hasKey / model） |
| `LLM_DEEPSEEK_OK` | 调用成功 |
| `LLM_DEEPSEEK_EMPTY` | content 为空（可能思考链没关） |
| `LLM_DEEPSEEK_FALLBACK_REASONING` | content 空但 `reasoning_content` 有，兜底捞出来 |
| `LLM_DEEPSEEK_EXCEPTION` | 网络异常 |
| `LLM_DEEPSEEK_HTTP_ERR` | 返回 4xx/5xx |
| `LLM_DEEPSEEK_RETRY` | 第 N 次重试 |
| `LLM_NO_SECRETS` | **`DEEPSEEK_API_KEY` 没配** ← 看到这个就是没配 |

---

## 五、⚠️ 对外口径冲突（待处理）

2026-09-23 拍板的对外口径：**不出现 "AI" 字样，统一称「小麦」🌾**。

代码现状（`workers/src/index.js`）：

| 行号 | 文案 | 用户可见？ |
|---|---|---|
| 1526 | system prompt：「我是小麦，你的 **AI** 日记助手」 | 模型内部，影响回答措辞 |
| 253 | 「🤖 **AI** 每日总结 · 模板库共享」 | ✅ **用户可见** |
| 1292 | 注释里的 `AI 每日总结` | ❌ 纯注释 |

**建议**：至少改 253 行（用户可见）；1526 行一并改，让模型严格只自称小麦。
注意同一段 prompt 里已写「绝对不要说自己是 AI/LLM/模型」（1526、1543、1645 行），措辞本身是自相矛盾的。

---

## 六、待确认

- [ ] **Agnes 是什么？** 背后套的是哪家模型（聚合平台）
- [ ] `DEEPSEEK_API_KEY` 当前是否已配？知识库是否在正常走 DeepSeek
- [ ] 前端 10 个功能，用户不填 API Key 时的降级方案是什么（现在会静默失败）
- [ ] 「AI」文案是否按对外口径统一改为「小麦」

---

## 七、维护提醒

改模型时按这个顺序查（**别只 grep 单个文件**）：

```bash
# ✅ 正确：递归全目录
grep -rni "模型关键词\|model\s*=" src/ workers/src/ functions/

# ❌ 错误：只看一个文件会漏（本次就漏了 workers/src/wiki.js 里的 DeepSeek）
grep -n "deepseek" workers/src/index.js
```

`workers/src/` 下有三个文件，都含 AI 调用：
```
index.js   91KB  主服务（Agnes）
wiki.js    89KB  知识库（DeepSeek）← 最容易漏
auth.js   3.3KB  鉴权，无 AI
```
