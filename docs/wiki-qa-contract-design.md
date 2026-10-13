# 小麦问答 × 知识库 一体化方案（v2.0 合并版）

> **版本**：v2.0（2026-10-12）
> **历史**：v1.0（2026-10-11）用户手动开关版 → v2.0 合并自动触发气泡 + 数据模型 + 输出契约 + 汇入流程
> **核心思想**：选知识库 = 选输出契约 + 选检索范围。知识库答不出时 AI 跳出回答，但答案符合该 KB 的分类和范本 → 可以一键汇入。
> **本次合并**：旧方案的后端设计 + 数据模型 + 输出契约的思路全部保留；新方案的触发时机 + 气泡 UI + 自然语言回答 + 复用 handleWikiIngestAll 汇入路径 全部采纳。解决了三个冲突。

---

## 一、背景 & 痛点

### 现在的问题

| 场景 | 现状 | 痛点 |
|------|------|------|
| 用户想在「📐 小学数学」知识库里问一道新题 | 小麦问答查知识库 → 没找到 → "知识库里没有这个内容" | 用户得切出去用豆包解题，再复制粘贴回来汇入，3 步 |
| 用户想往「红楼梦」知识库里加一个新分析 | 同上 | 答案格式不统一（豆包吐的 vs 知识库模板不一样），汇入时 AI 还要清洗 |
| 用户想往「菜谱」知识库里加一道菜 | 同上 | 同样的问题 |
| 用户空 KB，进来不知道第一步怎么建 | 小麦说"还是空的～先去添加资料吧" | 用户得切到 KB 页面手动粘贴，门槛高 |

### 根因

**选知识库 = 只选了检索范围，没选输出契约。**

小麦问答现在的 system prompt 只告诉 AI "查这些知识页面来回答"，没告诉 AI "如果知识库里没有，你应该按什么格式来回答才能直接入库"。

另外知识库建设的入口太重——用户得切页面、选分类、粘贴、点汇入——没人做。

---

## 二、核心思路

### 一句话版本

> **选知识库 = 选输出契约 + 选检索范围**。
> **AI 回答要自然**（不是硬塞模板），但内容分布要符合 KB 的分类和范本，这样能直接被汇入流程消化。

### 输出契约的三个组件（只约束格式，不限制 AI 能力）

| 组件 | 作用 | 限制了什么 | 没限制什么 |
|------|------|-----------|-----------|
| **分类列表** | 告诉 AI 回答内容应该归到哪些分类 | 归到哪里 | AI 能答什么 |
| **页面模板** | 告诉 AI 每个分类的页面应该有哪些 section | 长什么样 | section 里写什么 |
| **专属规范** | 格式约束（如数学禁 LaTeX、菜谱要写用量） | 不能用什么格式标记 | AI 的知识范围 |

类比：**答题纸不限制学生解题能力，病历模板不限制医生诊断能力**。输出契约就是那个答题纸——AI 该会解什么题还是会解，只是解完之后按模板组织一下内容分布。

### 边界情况

| 场景 | AI 能答吗 | 能装进去吗 | 处理 |
|------|-----------|-----------|------|
| 数学库 + 小学数学题 | ✅ | ✅ 分类装得下 | 正常输出 → 直接汇入 |
| 数学库 + 高中微积分 | ✅ | ⚠️ 分类里没高中 | **check-match 先挡**：low 匹配 → "主题不太相关"弹 ConfirmDialog |

---

## 三、触发方式（两套并行）

### 方式 1：气泡自动触发（小白用户，降低门槛）

4 个自动触发时机，前端发请求前判断，满足任一条件就加 `import_mode=true`：

| # | 时机 | 判定逻辑 |
|---|---|---|
| **1** | **知识 tab 刚进来 + 空 KB + 空 history** | 第一次对话，引导用户第一步怎么建设 KB |
| **2** | **用户自然语言里说"帮我收集/查询 XX 信息"** | question 匹配 `/收集|查询|整理|帮我找|帮我查|帮我搜/` + `/信息|资料|内容/` |
| **3** | **上一条 AI 回答说"KB 还是空的"** | lastAiAnswer 含「还是空的」 |
| **4** | **上一条 AI 回答说"KB 没找到"** | lastAiAnswer 含「暂时没有」 |

**不触发的情况**：用户正常问"知识库里刘备在哪几个事件里出场过？"→ 正常 KB RAG 问答，完全不变。

气泡不是每个 AI 回答下面都出（太吵），只在触发 import_mode 的时机里出。

### 方式 2：手动开关（重度用户，显式选择）

UI 上保留可选的「只查 / 生成」单选按钮，和气泡**不冲突、并行**：

| 开关 | 含义 | AI 行为 |
|------|------|---------|
| **只查**（默认） | 查我已存的内容 | 现在的行为：检索 → 引用知识库页面 → 找不到就说"没有" |
| **生成** | 帮我创造新内容，顺便存进去 | 强制 import_mode=true → 跳出知识库回答 → 下方出"💡 保存入库"提示 |

**为什么两套都要**：气泡降低新用户门槛（空 KB 一进来就被引导），开关给重度用户精确控制（比如"这次我就要生成，不管检索分数怎么样"）。

### 触发优先级

```
用户手动选了开关 → 以开关为准
用户没选开关 → 前端自动判断 4 个时机 → 决定 import_mode
```

---

## 四、气泡 UI 设计

### 气泡文案

```
🔍 按我知识库的分类和范本，帮我收集 {推荐实体} 的信息
```

- 从这个 KB 的 categories 里取前 2 个分类
- AI 动态推荐实体（和已有 wiki 页面**不重复**）
- 每个气泡有两个按钮：「发送」和「添加到对话」

### 示例 1：「三国」KB（分类：人物、事件）

```
用户刚选了 KB，还没开始对话
→ 出两个气泡：
   🔍 按我知识库的分类和范本，帮我收集 司马懿 的信息  [发送] [添加到对话]
   🔍 按我知识库的分类和范本，帮我收集 夷陵之战 的信息  [发送] [添加到对话]
```

### 示例 2：「路亚笔记」KB（分类：装备、钓法、钓点）

```
用户空 KB，小麦刚说「还是空的～先去添加资料吧」
→ 小麦 AI 回答改成直接出气泡：
   🔍 按我知识库的分类和范本，帮我收集 水滴轮 的信息  [发送] [添加到对话]
   🔍 按我知识库的分类和范本，帮我收集 波爬钓法 的信息  [发送] [添加到对话]
```

**用户点「添加到对话」→ 气泡内容插入输入框 → 用户可以自由修改**（比如加上限定条件：「帮我收集 司马懿 在 239 年之前的主要事迹」）→ 发送 → 后端走 import_mode 特殊流程。

---

## 五、完整用户流程

### 5.1 import_mode 特殊流程

```
import_mode=true 的请求进来
│
├─ 1. 强制 web_search=true（不管用户开关）
│     因为用户点气泡/选生成 = 他想查 KB 里还没有的东西
│
├─ 2. check-match 预检（主题 low 就弹 ConfirmDialog）
│     避免"数学 KB 问红楼梦"这种奇怪请求
│     low → 返回 need_confirm: true → 前端弹窗
│     medium / high → 继续往下
│
├─ 3. 拉 KB 的 categories + 每个分类的模板结构
│     wiki_categories 表
│
├─ 4. 拉 preset（如果是官方预设，有专属规范）
│     OFFICIAL_KB_PRESETS
│
├─ 5. buildWikiContractPrompt（输出契约 prompt）
│     注入：分类列表 + 每个分类的模板 + 专属规范
│     要求：AI 自然地组织回答，让内容分布符合这些分类和范本
│           语言要流畅连贯，不要生硬分标题
│
├─ 6. callLLM → AI 回答
│     （自然语言、连贯，但内容结构上符合范本）
│     ✅ 重点：内容要能直接被汇入！
│
└─ 7. 前端拿到回答 → 底部出现汇入按钮：
      📥 将本次回答汇入「三国」知识库（按【人物】分类）
      （按钮上直接写清楚汇入哪个 KB、哪个分类）

└─ 用户点「是」
      └─ **两步**（handleWikiIngestAll 不接受自由文本，必须先插 wiki_sources）：
         1. INSERT INTO wiki_sources (kb_id, user_id, kind='text', raw_text=AI回答, source='qa', ingested=0)
         2. POST /api/wiki/kbs/:kb_id/ingest（handleWikiIngestAll 查 ingested=0 的 source → 走完整 ingest → 处理完自动标记 ingested=1）
         ✅ wiki_pages.source_ids 溯源自动成立！
```

### 5.2 正常流程（import_mode=false，完全不变）

```
import_mode=false
├── 知识库能答（bestScore ≥ 阈值）→ 正常 RAG 回答 → 不出现汇入按钮
└── 知识库答不出 → 正常说「知识库里没有」或「可以开启联网查询」
```

### 5.3 关键设计决策记录

| # | 决策 | 结论 | 理由 |
|---|---|---|---|
| P0-1 | 触发方式 | 气泡自动触发（4 个时机）+ 可选手动开关（两套并行）| 气泡降新用户门槛，开关给重度用户精确控制 |
| P0-2 | AI 输出格式 | **自然语言，不硬塞模板，不是严格 JSON** | 用户明确要求"AI 回答要自然、连贯" |
| P0-3 | 汇入路径 | **走 handleWikiIngestAll，不跳过 ingest** | 旧方案"跳过 ingest 因为 AI 输出结构化"的假设不成立。handleWikiIngestAll 有涟漪更新、实体识别、交叉链接，跳过反而丢能力 |
| P0-4 | check-match 预检 | **挡**。生成模式下先跑，主题 low 弹 ConfirmDialog | 避免 AI 硬归出奇怪页面，保护 KB 质量 |
| P0-5 | 汇入是自动还是让用户点 | **让用户点**。AI 生成但不自动写入，回答下方出"📥 汇入"按钮 | 用户有最终决定权 |
| P0-6 | import_mode 暴露给用户吗 | 不暴露。气泡和开关都是 UI 层的，import_mode 是内部字段 | 小白用户不需要知道 |
| P0-7 | import_mode 时联网开关 | 强制 ON | 用户点气泡 = 查 KB 没有的，必须联网 |
| P0-8 | 气泡里的实体名 | AI 动态推荐 + 和已有页面不重复 | 避免推荐用户已经有的 |

---

## 六、后端设计

### 6.1 API 改动

```
现有 POST /api/chat/ask（或 /api/wiki/:kbId/ask）
  body: { question, history[], source_type, kb_id, web_search, import_mode }
                                                                    ↑ 新增

新增 GET /api/wiki/kbs/:kb_id/suggest
  给气泡用：返回 2 个 AI 推荐的实体名（和现有页面不重复）
```

### 6.2 handleWikiAsk 新逻辑（伪代码）

```js
async function handleWikiAsk(env, user, question, history, kb_id, web_search, import_mode) {
  // ... 前半段不变：拉 pages → 检索 → rerank → 算 bestScore

  // ===== 情况 1：知识库能答 → 不管 import_mode，都正常 RAG =====
  if (bestScore >= THRESHOLD && contextParts.length > 0) {
    return json({ answer, sources, kb_title });
  }

  // ===== 情况 2：知识库答不出 + 非 import_mode → 正常说没有 =====
  if (!import_mode) {
    sys = buildWikiRAGPrompt(kb, '（知识库里没有相关内容）', web_search);
    answer = await callLLM(env, sys + question);
    return json({ answer, sources: [], kb_title });
  }

  // ===== 情况 3：知识库答不出 + import_mode=true → 新流程 =====

  // 1. check-match 预检
  const matchResult = await checkWikiThemeMatch(env, kb, question);
  if (matchResult.level === 'low') {
    return json({ need_confirm: true, match_level: 'low', match_reason: matchResult.reason });
  }

  // 2. 强制 web_search
  web_search = true;

  // 3. 拉 categories + 模板
  const cats = await env.DB.prepare(
    "SELECT * FROM wiki_categories WHERE kb_id=? ORDER BY sort_order"
  ).bind(kb_id).all();

  // 4. 拉 preset 专属规范（如数学禁 LaTeX）
  const kbInfo = await env.DB.prepare(
    "SELECT slug FROM wiki_knowledge_bases WHERE id=?"
  ).bind(kb_id).first();
  const preset = OFFICIAL_KB_PRESETS.find(p => p.slug === kbInfo?.slug);

  // 5. buildWikiContractPrompt（输出契约 prompt）
  const contractPrompt = buildWikiContractPrompt(kb, cats, preset, question);

  // 6. callLLM（自然语言回答，不是 JSON）
  let answer;
  try { answer = await callLLM(env, contractPrompt, 800); }
  catch (e) { answer = '抱歉，我暂时答不上来：' + (e.message || ''); }

  // 7. 返回（含 can_save，告诉前端出汇入按钮）
  return json({
    answer,
    sources: [],
    kb_title: kb.title,
    can_save: true,
    category_hint: matchResult.suggested_category || cats.results[0]?.name,
  });
}
```

### 6.3 buildWikiContractPrompt（输出契约 prompt）

> **注意**：和旧方案不同——**不要求 AI 输出 JSON**。要求自然语言回答，但内容分布符合 KB 分类和范本。

```js
function buildWikiContractPrompt(kb, categories, preset, question) {
  // 拼分类+模板参考
  const catSection = categories.results.map(c => `
### 分类：${c.name}
页面模板参考：
${c.page_format || '(暂无模板)'}`).join('\n');

  // 拼专属规范（比如数学禁 LaTeX）
  const specialRules = preset?.extra_rules || '';

  return `你就是小麦，我的 AI 助手。我正在建设「${kb.title}」知识库。

## 用户问题
${question}

## 这个知识库的分类和范本（请参考，让回答内容自然地符合这些结构）
${catSection}

${specialRules ? '## 专属规范\n' + specialRules : ''}

## 回答要求
1. 语言流畅连贯，就像正常对话一样，**不要生硬地分标题或贴模板**
2. 但内容分布要自然地覆盖上面的分类和范本——比如提到"人物"时要提到他的生平、核心事件、关系网
3. 可以用你自己的知识补充（联网模式）
4. 如果内容涉及多个分类，自然地在各段落里体现，不用显式标注分类
5. 200-600 字，简洁清晰`;
}
```

### 6.4 suggest 接口（气泡用的实体推荐）

```
GET /api/wiki/kbs/:kb_id/suggest?count=2

逻辑：
1. 拉这个 KB 所有 wiki_pages 的 title
2. 拉这个 KB 所有 categories 的 name
3. 调一次小模型（Workers AI llama 或便宜的）：
   「KB 已有页面：{titles}，分类：{cats}。
    对于分类【{catA}】，用户还应该了解哪些实体？给 1 个。
    要求：不能和已有页面重复。」
4. 返回 [{ category: "人物", entity: "司马懿" }, ...]
```

---

## 七、汇入路径（走 handleWikiIngestAll，统一入口）

### 7.1 三个入口统一模型

所有入口最终都汇入 **wiki_pages**（结构化页面），区别只在于 wiki_sources 这一层：

```
                    ┌─────────────────────────────────┐
                    │         wiki_pages（结构化）       │
                    │  source_ids 溯源 → wiki_sources   │
                    └─────────────┬───────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
    ┌────▼────┐             ┌─────▼─────┐            ┌─────▼──────┐
    │ 入口 1  │             │  入口 2   │            │   入口 3    │
    │ 资料库  │             │ 知识库里  │            │  小麦问答   │
    │ 粘贴   │             │ 录入按钮  │            │ import_mode │
    └────┬────┘             └─────┬─────┘            └─────┬──────┘
         │                        │                        │
         ▼                        ▼                        ▼
   wiki_sources             wiki_sources              wiki_sources
   source='paste'           source='kb_entry'         source='qa'
   ingested=0               ingested=0                ingested=0
   (用户手动点汇入)          (用户手动点汇入)           (用户点📥汇入)
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                    handleWikiIngestAll(kb_id, text, category_hint?)
                                  │
                                  ▼
                    AI 自动识别实体 → 生成 wiki 页面
                    补 [[]] 交叉链接 → wiki_links
                    涟漪更新已有相关页面
                                  │
                                  ▼
                            wiki_pages 写入完成
```

| 入口 | 用户操作 | wiki_sources | ingest 触发 | 汇入函数 |
|------|---------|-------------|------------|---------|
| **1. 资料库粘贴/上传** | 粘贴文本或上传文件 | source='paste', ingested=0 | 用户点「汇入」| handleWikiIngestAll |
| **2. 知识库录入按钮** | 在 KB 里点「录入资料」 | source='kb_entry', ingested=0 | 用户点「汇入」| handleWikiIngestAll |
| **3. 问答 import_mode** | AI 答不出 → 生成自然语言回答 | source='qa', ingested=0 | 用户点「📥 汇入」| **handleWikiIngestAll（同一个函数！）**|

### 7.2 为什么统一走 handleWikiIngestAll（不用旧方案的"跳过 ingest 直接写 DB"）

旧方案假设"AI 输出结构化 JSON → 跳过 ingest → 直接写 wiki_pages"。这个假设**不成立**，因为：

1. **新方案 AI 输出是自然语言**，不是结构化 JSON——还是得走 AI 清洗/拆分
2. **handleWikiIngestAll 有涟漪更新**——新资料进来会自动扫描已有页面、补 `[[]]` 交叉引用、更新 wiki_links。跳过 ingest 会丢这个能力
3. **统一入口 = 统一溯源**——三个入口最终都走同一个函数，wiki_pages.source_ids 的溯源逻辑完全一致

### 7.3 wiki_sources 新增字段

```sql
ALTER TABLE wiki_sources ADD COLUMN source TEXT DEFAULT 'paste';
-- 值：'paste' | 'kb_entry' | 'qa'
```

### 7.4 wiki_pages.source_ids（已预留）

wiki_pages.source_ids 是 JSON 数组，记录"这个页面来自哪些 wiki_sources"：

```json
// 入口 3：AI 生成的 pages 都来自同一个 qa source
source_ids: ["src_007"]  // 这是 AI 回答对应的 wiki_source
```

这样用户可以在知识库里看到每个页面的"来源"——是粘贴的哪份资料、还是哪次问答生成的。

---

## 八、前端改动

### 8.1 api.ts 改动

```typescript
// askWiki 加参数
export function askWiki(
  question: string,
  kbId: string,
  history?: ChatMessage[],
  web_search = false,
  import_mode = false  // 新增：内部字段，不暴露给用户
)

// 新增：气泡用的实体推荐
export function wikiSuggestEntities(kbId: string, count = 2)

// 新增：汇入 AI 回答（和手动汇入同一个函数！）
export function wikiIngestAll(kbId: string, text: string, categoryHint?: string)
```

### 8.2 AiChatView.tsx 改动

```tsx
// 1. 触发时机判断（伪代码）
function shouldImportMode(question, kb, context) {
  const firstDialog = !history || history.length === 0;
  const kbEmpty = kb.pageCount === 0;
  const collectingIntent = 
    /收集|查询|整理|帮我找|帮我查|帮我搜/.test(question) 
    && /信息|资料|内容/.test(question);
  const lastAiSaysEmpty = lastAiAnswer?.includes?.("还是空的");
  const lastAiSaysNotFound = lastAiAnswer?.includes?.("暂时没有");
  const manualSwitchOn = userSelectedGenerateMode;  // 手动开关

  return manualSwitchOn || firstDialog || collectingIntent || lastAiSaysEmpty || lastAiSaysNotFound;
}

// 2. 气泡渲染（只在触发时机 + 还没对话时出）
{shouldShowBubbles && (
  <BubbleBar>
    {suggestions.map(s => (
      <Bubble
        text={`🔍 按我知识库的分类和范本，帮我收集 ${s.entity} 的信息`}
        onSend={() => sendWithImportMode(s.text)}
        onInsert={() => insertToInput(s.text)}
      />
    ))}
  </BubbleBar>
)}

// 3. 汇入按钮（AI 回答后，response.can_save=true 时出）
{response.can_save && (
  <SaveToKbPrompt
    kbTitle={response.kb_title}
    categoryHint={response.category_hint}
    onSave={async () => {
      await wikiIngestAll(kbId, response.answer, response.category_hint);
      // Toast："已汇入「三国」知识库"
    }}
  />
)}
```

### 8.3 改动量预估

| 层 | 改动 | 量 | 复用现有逻辑 |
|---|---|---|---|
| Worker | `handleWikiAsk` 加 `import_mode` 分支 + `buildWikiContractPrompt` | ~50 行 | ✅ 复用 callLLM / checkWikiThemeMatch / 现有 categories 查询 |
| Worker | 新增 `GET /api/wiki/kbs/:kb_id/suggest` | ~20 行 | ✅ 调一次小模型 |
| Worker | wiki_sources 加 source 字段 | 1 条 SQL | |
| 前端 AiChatView | 触发时机判断 + 气泡渲染 | ~60 行 | 新 UI |
| 前端 AiChatView | 发请求带 import_mode + 汇入按钮 | ~30 行 | ✅ 复用 handleWikiIngestAll |
| | **总计** | **~160 行** | |

---

## 九、边界情况

| 情况 | 处理 |
|------|------|
| 用户在"日记"模式问问题（没选知识库） | 不触发这个功能，保持原样 |
| 知识库只有模板，还没有任何页面 | 触发！因为检索肯定是空的，正符合"跳出知识库回答"的场景 |
| AI 返回的 pages 里分类不存在 | 后端 validate 一下，不存在就 fallback 到第一个分类 |
| 用户点了"不汇入"后又想汇入 | 回答还在屏幕上，按钮一直显示（不消失） |
| 用户问的问题和知识库完全不相关 | check-match 预检挡掉，弹 ConfirmDialog 让用户确认 |
| 用户选了 import_mode 但 KB 不存在 | 后端返回错误，和现在一样 |
| import_mode + 联网关 | 强制联网 ON，忽略用户开关 |

---

## 十、已决策 & 待讨论

### ✅ 已决策

| # | 问题 | 决定 | 理由 |
|---|------|------|------|
| P0-1 | 触发方式 | 气泡自动触发 + 可选手动开关（两套并行）| 降门槛 + 给重度用户精确控制 |
| P0-2 | AI 输出格式 | **自然语言，不硬塞模板，不是严格 JSON** | 用户明确要求 |
| P0-3 | 汇入路径 | **走 handleWikiIngestAll，不跳过 ingest** | 统一入口 = 统一溯源 = 统一涟漪更新 |
| P0-4 | check-match 预检 | **挡**。主题 low 弹 ConfirmDialog | 保护 KB 质量 |
| P0-5 | 汇入是自动还是让用户点 | **让用户点**「📥 汇入」按钮 | 用户有最终决定权 |
| P0-6 | import_mode 暴露给用户吗 | 不暴露 | 小白用户不需要知道 |
| P0-7 | import_mode 时联网开关 | 强制 ON | 用户点气泡 = 查 KB 没有的 |
| P0-8 | 气泡里的实体名 | AI 动态推荐 + 和已有页面不重复 | 避免重复 |
| P0-9 | wiki_sources 新增 source 字段 | `'paste' \| 'kb_entry' \| 'qa'` | 三个入口统一溯源 |

### 🔴 待讨论

| # | 问题 | 选项 |
|---|------|------|
| P1-1 | 手动开关 UI 形式 | a) 两个圆形单选项（推荐）b) toggle 开关 c) 下拉菜单 |
| P1-2 | check-match 预检逻辑 | 复用现有 handleWikiCheckMatch 还是写轻量版？现有那个是"汇入前预检"，import_mode 场景是"回答前预检" |
| P1-3 | import_mode 时 history 砍几条 | 现有 handleWikiAsk 砍到最近 6 条（3 轮），import_mode 要不要砍更多？（因为 import_mode 是"跳出知识库"，多轮上下文意义不大）|

---

## 十一、实现优先级（建议分 3 步）

| 步骤 | 内容 | 风险 | 依赖 |
|------|------|------|------|
| **Step 1** | 后端 import_mode 分支 + buildWikiContractPrompt + suggest 接口 + wiki_sources 加字段 | 低 | 无 |
| **Step 2** | 前端气泡 UI + 触发时机判断 + 汇入按钮 | 中 | Step 1 |
| **Step 3** | check-match 预检接入 + 手动开关 UI（可选）+ 边界情况打磨 | 中 | Step 1+2 |

---

## 十二、与现有方案的关系

| 现有功能 | 关系 |
|---------|------|
| **handleWikiAsk（现有）** | import_mode=false 时完全不变，import_mode=true 时走新分支 |
| **handleWikiIngestAll（现有）** | **核心复用**。三个入口统一走这个函数 |
| **check-match 预检（现有）** | 复用到 import_mode 场景 |
| **wiki_categories + page_format（现有）** | buildWikiContractPrompt 直接读，不新增表 |
| **小麦问答现有联网模式** | import_mode 本质是联网模式 + 输出契约 + 汇入路径 |
| **一键建 KB（v0.5.11）** | import_mode 是"让 KB 活起来"的第二个步骤——一键建 KB = 建空壳；import_mode = 自动往里填肉 |

---

## 附录：v1.0 → v2.0 改了什么（合并记录）

| 维度 | v1.0（旧 wiki-qa-contract-design）| v2.0（合并版）| 为什么改 |
|---|---|---|---|
| 触发方式 | 用户手动选「只查/生成」开关 | 气泡自动触发（4 时机）+ 可选手动开关 | 降低新用户门槛 |
| AI 输出 | 严格 JSON `{ pages, links, natural_answer }` | 自然语言，不硬塞模板 | 用户明确要求 |
| 汇入路径 | 跳过 ingest，直接写 DB | 走 handleWikiIngestAll | 旧假设不成立 + 统一入口有涟漪更新 |
| 联网开关 | 没说要不要强制 | import_mode 时强制 ON | 符合用户预期 |
| 气泡 UI | 没有 | 有（触发时机 + 文案 + 示例）| 用户纠正后的设计 |
| 后端函数名 | `handleWikiAsk(kb, question, generate_mode)` | `handleWikiAsk(kb, question, import_mode)` | 更准确，generate 暗示"创造"，import 暗示"汇入" |
| API 改动 | `auto_save` 字段 + `save-pages` 新接口 | `import_mode` 字段 + `suggest` 新接口 | save-pages 不需要了，因为走 handleWikiIngestAll |
