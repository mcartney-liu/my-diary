# 小麦问答 × 知识库 一体化方案

> **核心思想**：用户选了哪个知识库，AI 就按那个知识库的「分类+模板+规范」来回答。
> 当知识库本身答不出来时，AI 跳出知识库回答，但答案仍严格符合该知识库的输出契约 → 可以一键保存入库。

---

## 一、背景 & 痛点

### 现在的问题

| 场景 | 现状 | 痛点 |
|------|------|------|
| 用户想在「📐 小学数学」知识库里问一道新题 | 小麦问答查知识库 → 没找到 → "知识库里没有这个内容" | 用户得切出去用豆包解题，再复制粘贴回来汇入，3 步 |
| 用户想往「红楼梦」知识库里加一个新分析 | 同上 | 答案格式不统一（豆包吐的 vs 知识库模板不一样），汇入时 AI 还要清洗 |
| 用户想往「菜谱」知识库里加一道菜 | 同上 | 同样的问题 |

### 根因

**选知识库 = 只选了检索范围，没选输出契约。**

小麦问答现在的 system prompt 只告诉 AI "查这些知识页面来回答"，没告诉 AI "如果知识库里没有，你应该按什么格式来回答才能直接入库"。

---

## 二、核心思路

### 一句话版本

> **选知识库 = 选输出契约 + 选检索范围**。

### 🔑 关键澄清：输出契约 ≠ 限制 AI 能力

输出契约**只是约束"回答长什么样"，不约束 AI 知道什么、能解什么**。

打个比方：

| 类比 | AI 能力 | 输出契约 |
|------|---------|---------|
| 小学生做题 | 脑子里会算 | 答题纸格式："先写解，再列公式，最后答" |
| 医生写病历 | 脑子里会看病 | 病历模板："主诉、现病史、诊断、处方" |
| 作家写小说 | 脑子里会讲故事 | 出版社格式要求："标题黑体三号，章节编号" |

**答题纸不限制学生解题能力，病历模板不限制医生诊断能力**。输出契约就是那个答题纸——AI 该会解什么题还是会解，只是解完之后按模板组织一下内容。

### 输出契约的三个组件（只约束格式）

| 组件 | 作用 | 限制了什么 | 没限制什么 |
|------|------|-----------|-----------|
| **分类列表** | 告诉 AI 回答要归到哪个分类 | 归到哪里 | AI 能答什么 |
| **页面模板** | 告诉 AI 回答要填哪些 section | 长什么样 | section 里写什么 |
| **专属规范** | 格式约束（如禁 LaTeX） | 不能用什么格式标记 | AI 的知识范围 |

### 边界情况：AI 能答但装不下怎么办？

AI 能力很强（agnes-3.0-flash 能解高中微积分），但知识库的分类可能只有小学数学——

| 场景 | AI 能答吗？ | 能装进去吗？ | 处理 |
|------|-----------|-------------|------|
| 数学库 + 小学数学题 | ✅ | ✅ 分类装得下 | 直接生成 |
| 数学库 + 高中微积分 | ✅ | ⚠️ 分类里没高中 | **check-match 先挡**：low 匹配 → "主题不太相关" |

check-match（P0-2 已决策）就是干这个的——保护知识库数据质量，避免奇怪的数据混进来。

### 展开

用户在小麦问答里选了某个知识库后，AI 拿到的不只是"该查哪些 wiki_pages"，还要拿到：

1. **分类列表**（categories）— 回答应该归到哪个分类
2. **页面模板**（page_format）— 回答应该长什么样
3. **专属规范**（preset 里定义的规则，如数学禁 LaTeX）— 回答的边界条件

然后 AI 的行为分两种模式：

| 情况 | AI 行为 | 前端表现 |
|------|---------|---------|
| **知识库能答**（检索命中 ≥ 阈值） | 正常 RAG 回答，引用 [[页面]] | 就是现在的样子 |
| **知识库答不出**（检索命中 = 0 或低质量） | AI 跳出知识库自由回答，但**回答格式严格符合知识库的模板** | 回答下方出现「💡 这个答案符合知识库规范，保存入库」按钮 |

### 为什么可行

- **输出契约可控**：分类+模板+规范 都是知识库创建时就定好的，AI 按规矩输出就能直接入库
- **质量有保证**：AI 用的是我们自己的模型（agnes-3.0-flash），比豆包更懂我们的规范
- **用户零摩擦**：不用跳出去、不用复制粘贴，问答完一键入库

---

## 三、完整用户流程（UI 设计）

### 3.1 现状（不变）

```
小麦问答输入框
  ├─ 选了"日记" → 查日记 → 返回
  └─ 选了某个知识库 → 查知识库 wiki_pages → 返回（严格模式/联网模式）
```

### 3.2 新增：意图开关 + 智能补全入库

#### 核心决策：用户意图由用户自己选（方案 B）

不是靠检索分数判断，而是让用户在选知识库后**显式选意图**：

```
┌─────────────────────────────────────┐
│ 小麦问答                             │
│                                     │
│  🍳 菜谱知识库                       │
│  ┌──────────┬──────────┐            │
│  │ ○ 只查   │ ● 生成   │  ← 新增开关 │
│  └──────────┴──────────┘            │
│                                     │
│  你的问题...                         │
└─────────────────────────────────────┘
```

| 开关 | 含义 | AI 行为 |
|------|------|---------|
| **只查**（默认） | 查我已存的内容 | 现在的行为：检索 → 引用知识库页面 → 找不到就说"没有" |
| **生成** | 帮我创造新内容，顺便存进去 | 检索 → 有就引用；没有就按知识库模板回答 → 下方出现"💡 保存入库"提示 |

#### 用户完整流程

```
小麦问答输入框（选了知识库 + 选了"生成"）
│
├─ 用户输入："小明有 24 颗糖，平均分给 6 个小朋友，每人几颗？"
│
├─ 后端做两件事：
│  ├─ 1. 检索知识库 wiki_pages → 没找到（新题）
│  └─ 2. 用户选了"生成" → 构造输出契约 prompt → call LLM
│
├─ AI 回答（按知识库模板输出）：
│  │
│  │  【口语化回答给用户看】
│  │  这是一道平均分的除法题：24 ÷ 6 = 4，每个小朋友分 4 颗～
│  │  知识点是除法和平均分。
│  │
│  │  【结构化数据给系统看】
│  │  pages: [小明分24颗糖→二年级, 平均分→知识点]
│  │  links: [...]
│
└─ 前端检测到有结构化数据 → 回答下方出现：
   │
   │  ┌─────────────────────────────────┐
   │  │ 💡 这个答案按「📐 小学数学」      │
   │  │    的规范整理好了                 │
   │  │                                  │
   │  │    会新建 2 个页面：              │
   │  │    📄 小明分24颗糖（二年级）      │
   │  │    📄 平均分（知识点）            │
   │  │                                  │
   │  │         [保存]    [不保存]        │
   │  └─────────────────────────────────┘
```

#### 为什么不用检索分数判断？

同一个"答不出"，意图完全不同：

| 知识库 | 用户问 | 检索结果 | 用户真实意图 | 应该走 |
|--------|--------|---------|-------------|--------|
| 菜谱库 | "红烧肉怎么做？" | 没找到 | **查我存的**（没有就说没有） | 只查 → 诚实说没有 |
| 菜谱库 | "给我列 3 道凉菜" | 没找到 | **帮我生成** | 生成 → 跳出知识库 |
| 数学库 | "小明分糖这道题怎么解？" | 没找到 | **帮我解题** | 生成 → 跳出知识库 |
| 红楼梦库 | "林黛玉葬花时写了什么？" | 没找到 | **查我存的** | 只查 → 诚实说没有 |
| 红楼梦库 | "帮我分析葬花的深层含义" | 没找到 | **帮我写分析** | 生成 → 跳出知识库 |

分数无法区分"查"和"生成"——只有用户自己知道。

#### 与现有联网开关的关系

现有开关：`严格模式 / 联网模式`（system prompt 里是否允许用自身知识）
新增开关：`只查 / 生成`（是否允许跳出知识库创造新内容）

两个开关可以**正交组合**：

| 组合 | 效果 |
|------|------|
| 只查 + 严格 | 只能引用知识库页面，找不到就说没有（最保守） |
| 只查 + 联网 | 查知识库，补充可以用自身知识，但不创造新页面 |
| 生成 + 严格 | 知识库有就引用，没有就按模板回答（不能用知识库外的知识？其实不太对） |
| 生成 + 联网 | 知识库有就引用，没有就用自身知识按模板回答 → **主要场景** |

### 3.3 UI 关键问题：怎么让用户懂？

这是**最关键的设计决策**——用户可能不知道"什么是知识库规范"、"为什么这个答案能保存"。

**方案：渐进式教育**

| 场景 | 提示文字 | 理由 |
|------|---------|------|
| 用户第一次使用（没建过知识库） | 不显示这个功能 | 先把基础功能玩明白 |
| 用户建了知识库，在知识库 tab 里进问答 | 回答完后："💡 这个答案按「📐 小学数学」的规范整理好了，可以保存进知识库" | 明确告诉用户是"按你的知识库规范"，不是随便的答案 |
| 用户点"保存入库"后 | Toast："已保存 2 个页面到「📐 小学数学」" + 可点跳转查看 | 确认结果 |
| 用户点"不保存" | 记录偏好，下次同类问题可以不再提示（或者一直提示） | 尊重用户选择 |

### 3.4 前端交互 mockup（文字版）

```
┌─────────────────────────────────────┐
│ 小麦问答                             │
│                                     │
│  你：小明有24颗糖，平均分给6个小      │
│      朋友，每人几颗？                │
│                                     │
│  🌾：这是一道平均分的除法题～         │
│      24 ÷ 6 = 4，每个小朋友分4颗。   │
│      涉及的知识点：除法、平均分。      │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 💡 这个答案按「📐 小学数学」   │    │
│  │    的规范整理好了             │    │
│  │                              │    │
│  │    会新建：                   │    │
│  │    📄 小明分24颗糖（二年级）  │    │
│  │    📄 平均分（知识点）       │    │
│  │                              │    │
│  │         [保存]  [不保存]      │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 选知识库：📐 小学数学解题知识  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## 四、后端设计

### 4.1 API 改动

现有 `handleWikiAsk`（index.js L1755）加两个参数：

```
POST /api/wiki/:kbId/ask
  body: { question, history[], web_search, auto_save }
                                        ↑ 新增
```

### 4.2 handleWikiAsk 新逻辑

```js
async function handleWikiAsk(env, user, question, history, kb_id, web_search, generate_mode) {
  // ... 前半段不变：拉 pages → 检索 → rerank → 算 bestScore

  // ✅ 关键修正：开关控制的是"答不出时怎么办"，不是"强制走哪条路"
  // 不管开关开不开 → 只要知识库能答（检索命中够高 + AI 能推理）→ 就正常 RAG
  const KNOWLEDGE_HAS_ANSWER_THRESHOLD = 0.05;
  const kbHasAnswer = bestScore >= KNOWLEDGE_HAS_ANSWER_THRESHOLD && contextParts.length > 0;

  // ===== 情况 1：知识库能答 → 不管开关，都正常 RAG =====
  if (kbHasAnswer) {
    sys = buildWikiRAGPrompt(kb, context, web_search);
    answer = await callLLM(env, sys + question);
    return json({ answer, sources: finalTop, kb_title });
    // 不下发 can_save —— 知识库里已经有了，不需要重复生成

  // ===== 情况 2：知识库答不出 + 只查模式 =====
  } else if (!generate_mode) {
    sys = buildWikiRAGPrompt(kb, '（知识库里没有相关内容）', false);
    answer = await callLLM(env, sys + question);
    return json({ answer, sources: [], kb_title });

  // ===== 情况 3：知识库答不出 + 生成模式 =====
  } else {

    // ✅ P0-2 已决策：先跑 check-match 预检
    const matchResult = await checkWikiThemeMatch(env, kb, question);
    if (matchResult.level === 'low') {
      // low 匹配 → 返回给前端让弹 ConfirmDialog
      // 前端显示："🤔 这个问题和「数学」知识库主题不太匹配，要强行生成吗？"
      return json({
        need_confirm: true,
        match_level: 'low',
        match_reason: matchResult.reason,
        kb_title: kb.title,
      });
    }
    // medium / high 直接往下走，让 AI 生成

    // 1. 拉 categories（含 page_format 模板）
    const cats = await env.DB.prepare(
      "SELECT * FROM wiki_categories WHERE kb_id=? ORDER BY sort_order"
    ).bind(kb_id).all();

    // 2. 拉 preset（如果是官方预设，有专属规范）
    const kb = await env.DB.prepare(
      "SELECT slug FROM wiki_knowledge_bases WHERE id=?"
    ).bind(kb_id).first();
    const preset = OFFICIAL_KB_PRESETS.find(p => p.slug === kb?.slug);

    // 3. 构造"输出契约 prompt"
    const contractPrompt = buildWikiContractPrompt(kb, cats, preset, question);

    // 4. callLLM（要求返回 JSON + 口语化回答）
    const raw = await callLLM(env, contractPrompt, 4096);
    const parsed = repairAiJson(raw);

    // 5. 用户点了"保存"后（前端再调一次 POST save-pages）
    //    这里不自动保存——让用户有最终决定权

    // 6. 返回（含结构化数据，前端用来渲染"保存入库"提示）
    return json({
      answer: parsed?.natural_answer || '我整理了一下，请看下面的结构化内容～',
      sources: [],
      kb_title: kb.title,
      can_save: true,                     // 生成模式下永远可保存
      proposed_pages: parsed?.pages?.map(p => ({
        title: p.title,
        category_slug: p.category_slug,
      })) || [],
      raw_json: parsed,                    // 前端存着，用户点"保存"时 POST 回来
    });
  }
}
```

### 4.3 buildWikiContractPrompt（新函数）

```js
function buildWikiContractPrompt(kb, categories, preset, question) {
  // 拼分类+模板
  const catSection = categories.results.map(c => `
## ${c.name} (slug: ${c.slug})
页面模板：
${c.page_format || '(暂无模板)'}`).join('\n');

  // 拼专属规范（比如数学禁 LaTeX）
  const specialRules = preset?.extra_rules || '';

  return `# 你是「${kb.title}」的专属整理助手

## 用户问题
${question}

## 可用分类和模板
${catSection}

${specialRules}

## 任务
用户的问题**没有在知识库中找到答案**，需要你根据问题内容，自行回答并按上述分类和模板整理成知识库页面。

## 输出格式
严格 JSON，不要任何解释文字：
{
  "pages": [
    {
      "title": "<=20字的概括标题",
      "category_slug": "分类slug",
      "action": "create",
      "summary": "一句话说明",
      "content": "按模板写的 Markdown。注意：不要第一行 # 大标题（title 字段已经有了）。content 从模板的第一个 ## 开始。{{占位符}}替换成真实值。"
    }
  ],
  "links": [{"from": "页面A", "to": "页面B"}],
  "natural_answer": "给用户看的口语化回答，2-3句话，友好简洁"
}

## 铁律
- 严格 JSON，不解释
- 一个问题至少建 1 个 pages；如果涉及多个知识点，每个知识点各建一页
- 知识点之间用 [[链接]] 双向引用
`;
}
```

### 4.4 新增：前端点"保存"的后端接口

```
POST /api/wiki/:kbId/save-pages
  body: { pages: [...], links: [...] }
  → 写入 wiki_pages + wiki_links
```

或者直接在 ask 时传 `auto_save: true`，一步到位。

---

## 五、前端改动

### 5.1 api.ts

```typescript
// askWiki 加参数
export function askWiki(
  question: string,
  kbId: string,
  history?: ChatMessage[],
  web_search = false,
  generate_mode = false  // 新增：用户选的"生成"开关
)

// 新增：保存 AI 生成的页面（用户点"保存"后调用）
export function saveWikiPages(
  kbId: string,
  pages: WikiPageDraft[],
  links: WikiLinkDraft[]
)
```

### 5.2 UI 组件

在小麦问答的回答渲染组件里加一个新分支：

```tsx
// 伪代码
{response.can_save && !response.auto_saved && (
  <SaveToKbPrompt
    kbTitle={response.kb_title}
    proposedPages={response.proposed_pages}
    onSave={async () => {
      await saveWikiPages(kbId, response.raw_json.pages, response.raw_json.links);
      // Toast + 刷新知识库页面列表
    }}
    onDismiss={() => { /* 不保存 */ }}
  />
)}
```

---

## 六、边界情况

| 情况 | 处理 |
|------|------|
| 用户在"日记"模式问问题（没选知识库） | 不触发这个功能，保持原样 |
| 知识库只有模板，还没有任何页面 | 触发！因为检索肯定是空的，正符合"跳出知识库回答"的场景 |
| AI 返回的 pages 里 category_slug 不存在 | 后端 validate 一下，不存在就 fallback 到第一个分类，log 警告 |
| 用户点了"不保存"后又想保存 | 目前这轮 ask 的 raw_json 前端可以暂存 5 分钟，过期了就重新问一次 |
| 自动保存（auto_save=true）但 pages 里有标题重复 | upsert：存在就 update，不存在就 create |
| 用户问的问题和知识库完全不相关（比如在数学 KB 问红楼梦） | AI 可能硬归到某个分类 → 这到底要不要挡？（见下面的待讨论） |

---

## 七、已决策 & 待讨论

### ✅ 已决策

| # | 问题 | 决定 | 理由 |
|---|------|------|------|
| P0-1 | 怎么判断"知识库答不出"？ | **用户开关**（方案 B）：`只查`/`生成` 由用户自己选 | 检索分数无法区分"查已存内容"和"让你帮我创造"这两种完全不同的意图，只有用户自己知道 |
| P0-2 | 不相关问题挡不挡？ | **挡**（选项 b）。生成模式下先跑 check-match 预检，主题 low 就弹 ConfirmDialog 让用户确认是否强行生成 | 避免 AI 硬归出奇怪的页面，保护知识库质量 |
| P0-3 | 保存入库是自动的还是让用户点？ | **让用户点**。生成模式下 AI 生成页面但不自动写入，回答下方出现"💡 保存"卡片让用户确认 | 用户有最终决定权，避免误写入 |

### 🔴 待讨论（必须定了才能开工）

| # | 问题 | 选项 |
|---|------|------|
| P1-1 | 回答里的结构化 JSON 怎么传给前端？ | a) 后端返回 `raw_json` 字段存 state（推荐）<br>b) AI 输出隐藏 `<details>` 块前端正则解析<br>c) 两次 callLLM |
| P1-2 | "保存入库"按钮在回答里显示多久？ | a) 一直显示（推荐）<br>b) 5 分钟后消失<br>c) 刷新页面就消失 |
| P1-3 | 保存后是否自动刷新知识库页面列表？ | a) 自动刷新（推荐）<br>b) 用户手动刷新 |
| P1-4 | 开关 UI 形式？ | a) 两个圆形单选项（推荐）<br>b) toggle 开关<br>c) 下拉菜单 |

---

## 八、实现优先级（建议分 3 步）

| 步骤 | 内容 | 风险 | 依赖 |
|------|------|------|------|
| **Step 1** | 后端 `buildWikiContractPrompt` + 知识库空时返回 `can_save=true` | 低 | 无，纯后端 |
| **Step 2** | 前端 `SaveToKbPrompt` 组件 + `saveWikiPages` 接口 | 中 | Step 1 |
| **Step 3** | 主题匹配检查（check-match 复用）+ auto_save 开关 | 中 | Step 1+2 |

---

## 九、与现有方案的关系

| 现有功能 | 关系 |
|---------|------|
| **汇入资料（ingest）** | 继续保留。豆包复制粘贴的场景仍然需要。新方案是"AI 直接帮你解题+入库"的快捷路径 |
| **check-match 预检** | 可复用到 Step 3 的主题匹配判断 |
| **数学专属 prompt** | 直接复用。`buildWikiContractPrompt` 里调用 `buildWikiSystemPrompt` 里那套数学规则 |
| **小麦问答现有联网模式** | 融合。"跳出知识库回答"本质上就是联网模式的一种，只是多了输出契约和入库逻辑 |
| **Modal / ConfirmDialog** | 新增的 `SaveToKbPrompt` 用 ConfirmDialog 风格 |

---

## 十、知识库输入统一入口

### 10.1 现有数据模型回顾

`
wiki_sources（原始输入）
  ├─ id, kb_id, user_id
  ├─ raw_text        ← 原始文本（可能脏、非结构化）
  ├─ kind            ← 'text' | 'diary' | 'file'
  ├─ ingested        ← 0=待汇入, 1=已汇入
  └─ ingested_at

wiki_pages（结构化页面）
  ├─ id, kb_id, user_id
  ├─ title, content, summary
  ├─ category_id
  └─ source_ids      ← 已预留！关联 wiki_sources.id 的 JSON 数组
`

**关键发现**：wiki_pages.source_ids 字段已经存在——之前设计时就考虑了"溯源"，一个页面可能来自多份资料。

### 10.2 三个入口的统一模型

所有入口最终都汇入 **wiki_pages**（结构化页面），区别只在于 wiki_sources 这一层：

`
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
    │ 粘贴   │             │ 录入按钮  │            │  生成模式   │
    └────┬────┘             └─────┬─────┘            └─────┬──────┘
         │                        │                        │
         ▼                        ▼                        ▼
   wiki_sources             wiki_sources              wiki_sources
   source='paste'           source='kb_entry'         source='qa'
   ingested=0               ingested=0                ingested=1  ← 同步写 pages
   (用户手动点汇入)          (用户手动点汇入)           (AI 输出已是结构化)
`

| 入口 | 用户操作 | wiki_sources | ingest 触发 | wiki_pages |
|------|---------|-------------|------------|-----------|
| **1. 资料库粘贴/上传** | 粘贴文本或上传文件 | source='paste', ingested=0 | 用户点「汇入」按钮 | AI 清洗 + 归类 + 写 pages |
| **2. 知识库录入按钮** | 在 KB 里点「录入资料」 | source='kb_entry', ingested=0 | 用户点「汇入」按钮 | 和入口 1 完全一样 |
| **3. 问答生成模式** | AI 答不出 → 输出契约生成 | source='qa', ingested=1 | **跳过 ingest** ↓ | 直接写 pages + links |

### 10.3 入口 3 为什么跳过 ingest？

入口 1 和 2 的 wiki_sources.raw_text 是**脏的**——可能是豆包复制粘贴、可能是文件上传、格式乱七八糟——必须走一遍 ingest 清洗（repairAiJson + 模板填充 + 链接提取）。

但入口 3 的 wiki_sources.raw_text 是**AI 按输出契约生成的**——已经是正确的模板格式、已经分好类、已经建了链接——**不需要再清洗**，可以直接写 wiki_pages。

### 10.4 wiki_sources 新增字段

`sql
ALTER TABLE wiki_sources ADD COLUMN source TEXT DEFAULT 'paste';
-- 值：'paste' | 'kb_entry' | 'qa'
`

### 10.5 状态流转

`
入口 1 / 2：
  用户粘贴 → wiki_sources(ingested=0) → 用户点汇入 → ingest → wiki_pages → wiki_sources(ingested=1)

入口 3：
  AI 生成 → wiki_sources(ingested=1) + wiki_pages 同步写入 → 直接完成
`

**统一语义**：ingested=1 = 已回录 = 已汇入。不管哪个入口，最终状态都是一样的。

### 10.6 溯源关系

wiki_pages.source_ids 是 JSON 数组，记录"这个页面来自哪些 wiki_sources"：

`json
// 入口 1/2：一个页面可能来自多份资料（汇入时 AI 合并了）
source_ids: ["src_001", "src_003"]

// 入口 3：AI 生成的 pages 都来自同一个 qa source
source_ids: ["src_007"]  // 这是 AI 回答对应的 wiki_source
`

这样用户可以在知识库里看到每个页面的"来源"——是粘贴的哪份资料、还是哪次问答生成的。
