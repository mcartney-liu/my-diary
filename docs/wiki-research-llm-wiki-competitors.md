# LLM Wiki 竞品调研报告

> **性质**：调研报告（v0.1 初稿，不动手）
> **日期**：2026-10-11
> **调研对象**：有道云笔记 LLM Wiki、360 企业知识库、Karpathy 原始 LLM Wiki 模式
> **对比基准**：MyDiary 现有 Wiki v4

---

## 一、背景

用户反馈 MyDiary 知识库"有些使用上不太方便"。调研发现市面上有道云笔记和 360 知识库都用了 **Karpathy 提出的 LLM Wiki 模式**——这是 2026 年 4 月 Andrej Karpathy 提出的一种全新的知识库范式，已经有 5000+ stars 和大量落地实现。

---

## 二、Karpathy 原始 LLM Wiki 模式（理论源头）

> 灵感来源：Karpathy 的 [gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)（已 5000+ stars）

### 核心思想

```
传统 RAG：用户提问 → 临时拼接上下文 → LLM 回答 → 用完就扔
LLM Wiki：用户给素材 → Agent 自动编译成结构化知识库 → 长期维护 → 查询时直接读结构化页面
```

Karpathy 原话：**"编译一次、持续维护"**（compile once, maintain forever）

### 目录结构（Markdown 文件夹）

```
wiki/
├── raw/              # Layer 1: 原始素材（不可变，可追溯）
│   ├── source-1.md   # 比如一篇文章原文、一段对话原文
│   └── source-2.md
├── entities/          # Layer 2a: 实体页（人物、组织、产品）
│   ├── transformer.md
│   └── attention.md
├── concepts/          # Layer 2b: 概念页（技术、方法论、主题）
│   ├── self-attention.md
│   └── positional-encoding.md
├── comparisons/       # Layer 2c: 对比页（两个东西的对比）
│   └── rnn-vs-transformer.md
├── schema.md          # 真相源：定义这个知识库的结构和规则（人类写）
├── index.md           # 目录：所有页面的索引（Agent 自动维护）
└── log.md             # 操作日志：每次摄入/更新记录（Agent 自动维护）
```

### 四种核心操作

| 操作 | 触发 | Agent 行为 |
|---|---|---|
| **Ingest（摄入）** | 给一段素材（URL/文本/文件） | 抓原文 → 存 raw/ → 抽实体/概念 → 创建/更新页面 → 加交叉引用 → 更新 index |
| **Query（查询）** | 提一个问题 | 读 index → 定位相关页 → 跨页综合 → 给答案+标注来源 → 检测矛盾 |
| **Lint（一致性检查）** | "帮我审计一下知识库" | 全量扫描 → 检查矛盾声明、孤立页面（无交叉引用）、数据空白 → 输出报告 |
| **Archive（归档）** | "把刚才那段对话存进去" | 识别有价值内容 → 判断类型（概念/对比/查询）→ 存对应位置 |

### Schema 驱动（关键设计！）

每个知识库有一个 `schema.md` 文件，**人类写的规则手册**，告诉 Agent：

```markdown
# Schema — AI 研究知识库

## 结构
- entities/ 存人和产品
- concepts/ 存技术概念
- comparisons/ 存技术对比

## 命名规则
- 全部小写、连字符（kebab-case）
- 同一个实体必须用同一个名字（Transformer 不能又叫 Transformer Model）

## 实体页模板
# [实体名]
**Type**: model | person | org
**源引用**: → raw/source-3.md
## 核心事实
## 与其他实体的关系
[[attention]] 是核心组件

## 交叉引用规则
- 每个页面至少有 2 个 wikilink
- 同一来源的实体之间必须互链
```

Schema 的价值：**Agent 不会自己发明结构，而是严格按 schema 来**。不同领域的知识库可以有完全不同的 schema。

### 与传统 RAG 的本质区别

| 维度 | 传统 RAG | LLM Wiki |
|---|---|---|
| 处理时机 | 查询时临时做 | 摄入时就做好 |
| 存储形式 | 向量 + 原文片段 | 结构化页面 + 交叉引用 |
| 重复计算 | 每次查询都重复 chunk/embed/rerank | 编译一次，查询直接读结构化页面 |
| 上下文质量 | 拼接的片段可能缺信息 | 已整理好的页面，信息密度高 |
| 矛盾处理 | 不同片段可能说不同的话，RAG 不管 | 明确标注 `⚠️ 页面A与页面B在此点有分歧` |
| 知识复合 | 不会自己长，永远是原始素材 | 新素材进来触发已有页面更新，知识会生长 |
| 可追溯 | 片段来自哪个原文不清楚 | raw/ 里有原文，每页都有源引用 |

---

## 三、有道云笔记 LLM Wiki（第一个正式落地的产品）

### 产品形态

有道云笔记 + AI Agent 插件 = 用户用自然语言操作有道云笔记里的 Wiki

### 四步工作流

```
① 创建：对 Agent 说"帮我创建一个知识库，主题是 AI 研究"
       → Agent 在有道云笔记自动建文件夹结构（raw/entities/concepts/comparisons + schema/index/log）
       → 登记到全局注册表 youdaonote-wiki-registry.md

② 摄入：对 Agent 说"把这篇文章整合进 ai-wiki：<URL>"
       → Agent 抓网页 → 存 raw/ → 抽实体和概念 → 交叉引用 → 更新 index
       → 汇报："已摄入，新建 3 页，更新 5 页"

③ 查询：对 Agent 说"在 ai-wiki 里，Transformer 和 RNN 各自有哪些典型应用？"
       → Agent 读 index → 定位相关页 → 跨页综合 → 带来源的答案
       → 发现矛盾时："⚠️ 页面A与页面B在此点有分歧"

④ 维护：对 Agent 说"帮我审计一下 ai-wiki"
       → Agent 扫描全库 → 检查孤立页面、矛盾、空白 → 输出报告
```

### 关键产品决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 存储介质 | 有道云笔记云端（Markdown 笔记） | 天然多端同步、用户可直接查看/编辑、Agent 通过 CLI 读写 |
| Agent 执行层 | 独立 Skill 插件 + CLI | 可以接 LobsterAI、Cursor、Claude Code 等多种 Agent |
| 触发方式 | 自然语言对话（"xxx-wiki" 关键词自动切换） | 用户不用懂 API |
| Schema 管理 | Agent 自动写初始 schema.md，用户可改 | 真相源，不要删 |
| raw/ 可编辑？ | 按设计不建议编辑（保持可追溯性） | 修正写在对应的 wiki 页面 |

### 截图级细节（从文档推断）

```
Agent 摄入后的汇报：
  已摄入，新建 3 页，更新 5 页。
  以下内容你可能想深入讨论：
  1. self-attention 与 cross-attention 的区别
  2. Transformer 与 RNN 的并行性对比
  3. BERT 与 GPT 的架构差异

Agent 查询时发现矛盾：
  在 xxx-wiki 里，关于 "XX 的发布时间"：
  - [[entity-a]] 说：2024 年 3 月
  - [[entity-b]] 说：2024 年 5 月
  ⚠️ 两个来源有分歧
```

---

## 四、360 知识库（企业级，对比参考）

### 定位

**企业级**知识库产品，面向政企客户，不是面向个人用户的产品。

### 核心能力

| 能力 | 说明 |
|---|---|
| 全域知识采集 | 智能体自动采集企业内外分散的知识 |
| 知识加工 | AI 整理、清洗、标注 |
| 知识存储 | 向量库 + 文档库 |
| 知识服务 | API 化知识服务，对接业务系统 |
| 智能体编排 | 无代码拖拖拽拼装企业级智能体 |
| 私有化部署 | 支持 |
| 安全合规 | 持证上岗（国家生成式 AI 备案） |

### 与 LLM Wiki 的关系

360 做的是**企业级 RAG 增强**——传统 RAG + 更好的采集 + 更好的问答体验。**它没有用 Karpathy 的 LLM Wiki 模式**（没有 schema、没有实体页/概念页分层、没有交叉引用）。

### 对 MyDiary 的参考价值

有限。360 是企业级重武器，MyDiary 是个人轻量应用。但"智能体自动采集 + 无代码编排"的思路值得参考。

---

## 五、MyDiary 现有 Wiki v4 vs 有道云 LLM Wiki 对比

### 架构层面

| 维度 | MyDiary Wiki v4 | 有道云 LLM Wiki |
|---|---|---|
| **设计源头** | 自研（模板 + 分类 + RAG） | Karpathy LLM Wiki 模式 |
| **知识库结构** | KB → 分类（内置模板）→ 页面 + 资料源 | KB → raw + entities + concepts + comparisons |
| **Schema 驱动** | ❌ 无（模板代替 schema） | ✅ schema.md 是真相源 |
| **存储介质** | D1 数据库（结构化表） | 有道云笔记 Markdown 文件 |
| **向量化** | ✅ Workers AI bge-m3 | ❌ 不用向量（直接读结构化页面） |
| **交叉引用** | ✅ 有（双括号 [[实体]] + wiki_links 表） | ✅ 有（wikilinks 自动维护） |

### 操作流程层面

| 操作 | MyDiary Wiki v4 | 有道云 LLM Wiki |
|---|---|---|
| **摄入（Ingest）** | 用户手动点"📥 添加资料"→ 粘贴/上传 → 手动选分类 → 手动点"汇入知识库" | 用户对 Agent 说"把这段整合进 xxx-wiki" → Agent 全自动 |
| **查询（Query）** | 用户在 Wiki QA 对话框提问 → RAG 检索（向量+关键词+Reranker） | 用户对 Agent 说"在 xxx-wiki 里问" → Agent 读结构化页面综合 |
| **一致性检查（Lint）** | ❌ 没有 | ✅ Agent 扫描全库找矛盾、孤立页面 |
| **归档对话（Archive）** | ❌ 没有 | ✅ "把刚才那段对话存进去" |
| **后台自动维护** | ❌ 没有（用户点一次处理一次） | ✅ Agent 自动维护（更新已有页面、加交叉引用） |
| **矛盾检测** | ❌ 没有 | ✅ Agent 明确标注 `⚠️ 页面A与页面B有分歧` |

### 用户体验层面

| 维度 | MyDiary | 有道云 |
|---|---|---|
| 摄入成本 | 高（3-4 步手动操作） | 极低（自然语言一句话） |
| 知识生长 | 静态（每次汇入互不关联） | 动态（新素材触发已有页面更新） |
| 查询质量 | RAG 拼接片段，可能缺信息 | 读已整理的结构化页面，信息密度高 |
| 维护成本 | 用户自己管 | Agent 自动管 |

---

## 六、核心差距分析

### 差距 1：MyDiary 没有"持续维护"的概念

**现状**：用户每次汇入资料 → AI 独立处理 → 生成页面 → 结束。新旧素材之间互不关联。

**有道云的做法**：新素材进来 → Agent 自动看"有没有已有页面提到过这个实体/概念" → 有的话更新（追加事实、加新交叉引用）→ 没有的话新建。**知识会自己长**。

**举例**：
- 用户第一次摄入"Transformer 架构"→ Agent 建 `transformer.md`，加交叉引用 `[[attention]]`
- 用户第二次摄入"Self-Attention 的数学推导"→ Agent 发现 `attention` 已存在 → 更新 `attention.md`（追加数学公式部分）→ 在 `transformer.md` 里加新引用 `[[self-attention]]`

MyDiary 做不到这个——第二次汇入生成的是全新页面，和第一次的页面没有自动关联。

### 差距 2：MyDiary 没有 Schema 驱动

**现状**：用"内置模板"代替 schema——运维任务模板、故障SOP模板、记账模板...模板是固定的 blocks 结构，定义了页面长什么样。

**有道云的做法**：schema.md 定义的是**整个知识库的规则**——目录结构、命名规范、实体页模板、交叉引用规则...Agent 严格按 schema 执行。Schema 可以修改、可以分享。

**核心差异**：MyDiary 的模板定义"单个页面长什么样"，有道云的 schema 定义"整个知识库怎么运作"。

### 差距 3：MyDiary 没有一致性检查（Lint）和矛盾检测

**现状**：汇入口是批处理，AI 只管"把这段素材变成页面"，不会回头看其他页面有没有说相反的话。

**有道云的做法**：
- 摄入时 AI 主动检查"这个事实和已有页面冲突吗？"
- 用户可以随时触发 Lint："帮我审计一下知识库"
- 查询时 AI 自动标注矛盾：`⚠️ 页面A说发布时间是3月，页面B说是5月`

### 差距 4：MyDiary 的摄入太重了

**现状**：用户要 3-4 步手动操作（进知识库 → 进分类 → 点添加资料 → 粘贴 → 选汇入）。实际上**没人做**（之前查到 3 个 IT 运维 KB 全是空的）。

**有道云的做法**：一句话搞定——"把这段整合进运维-wiki"。

---

## 七、对 MyDiary 的启示

### 方案 A：渐进式改造（保留现有架构，加 LLM Wiki 的核心能力）

**保留**：D1 数据库结构、分类/模板体系、Worker 后端、前端 UI

**新增**：

| 新增能力 | 怎么做 | 工作量 |
|---|---|---|
| **自动维护（持续更新）** | 汇入新资料时，AI 先查"有没有已有页面提到过相同实体"→ 有则更新，无则新建 | 中（需要改 wikiCallLLM 的 prompt + 页面更新逻辑） |
| **Schema 概念** | 每个 KB 加一个 `schema` 字段，定义目录结构、命名规则、实体页格式。用内置模板作为初始 schema | 小（加个字段 + Worker 逻辑） |
| **交叉引用自动生成** | 现有 wiki_links 表已经有基础，改成每次汇入时 AI 主动加新交叉引用 | 小（改 prompt） |
| **Lint 功能** | 新 Worker 路由 `POST /api/wiki/:kbId/lint`——AI 扫描全库，找孤立页面、矛盾、空白 | 中（新路由 + prompt） |
| **归档对话** | 小麦 AI 助手加个"存进知识库"按钮——把当前对话有价值的内容存入 KB | 小（前端按钮 + Worker 路由） |

**不做**：不用向量化（现有 bge-m3 已够用）、不用改 Markdown 存储（继续用 D1 表）、不用改 Agent 插件模式（MyDiary 是独立 App）

### 方案 B：范式迁移（向 Karpathy LLM Wiki 靠拢）

**把现有 D1 数据库结构改造成 Karpathy 的文件系统模式**——entities/、concepts/、comparisons/ 分层，schema.md 真相源。

**不推荐**：工作量太大（D1 表结构大改）、用户已有数据迁移成本高、现有 UI 全部重写。

### 方案 C：先做最痛的一个点——降低摄入成本

**核心洞察**：3 个 IT 运维 KB 全空，说明"手动汇入"的操作太重了。用户懒得做。

**最小可行改动**：
- 在"小麦 AI 助手"里加一个"📥 存进知识库"按钮
- 用户和小麦对话（比如"我今天处理了一个导数需求..."）→ 对话框底部加"存入运维知识库"→ 一键完成摄入
- 后端调现有 `handleWikiIngestAll`，前端不用改知识库页面

**工作量**：小（前端按钮 + Worker 路由）。**价值**：直接解决"没人往 KB 里放东西"的问题。

---

## 八、建议下一步

1. **先讨论**：把这份调研报告发给团队，看看共识在哪个方向
2. **选方案 A 或 C 先做 MVP**：不要同时开多个坑
3. **定优先级**：我建议"自动维护（持续更新）"排第一——这是 LLM Wiki 模式和传统 RAG 最大的价值差异，也是用户感知最强的变化
4. **保留向量化**：Karpathy 模式刻意不用向量（说"结构化页面比向量检索更准"），但 MyDiary 已有 bge-m3 向量基础设施，没必要删，可以作为补充检索

---

## 九、参考资料

| 来源 | URL |
|---|---|
| Karpathy 原始 gist | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| 有道云 LLM Wiki 官方文档 | https://note.youdao.com/help-center/skill-wiki-guide.html |
| LobeHub llm-wiki skill | https://lobehub.com/skills/von-cas-von_ai_agents-llm-wiki |
| Hermes Agent llm-wiki | https://github.com/NousResearch/hermes-agent/tree/main/skills/research/llm-wiki |
| PromptMetrics 深度解读 | https://www.promptmetrics.dev/blog/llm-wiki-the-self-writing-knowledge-base |
| 360 AI 企业知识库 | https://aiplus.360.cn/ai.html |
| RAG Best Practices 2025 | https://martinuke0.github.io/posts/2025-12-26-understanding-rag-from-scratch/ |
