# MyDiary 知识库开放生态：本地文件 + MCP Server 方案

> **文档性质**：方案设计（待评审）
> **版本**：v0.1
> **日期**：2026-10-12
> **状态**：🟡 评审中，未实现
> **关联文档**：[wiki-research-llm-wiki-competitors.md](./wiki-research-llm-wiki-competitors.md)（竞品调研）、[ai-capabilities-and-models.md](./ai-capabilities-and-models.md)（AI 能力全景）、[APP-SYNC-RULES.md](./APP-SYNC-RULES.md)（App/Web 构建变量）

---

## 一、为什么要做

### 1.1 现状问题

MyDiary 知识库当前是**封闭的**——建好了只能在 App 里看，小麦问答是唯一主动消费出口。用户的知识沉淀被锁在 App 里，外部工具（Obsidian、VSCode、AI Agent）无法利用。

对比有道云笔记 LLM Wiki：虽然有道也在自己平台里，但它可以通过**龙虾 AI Agent** 让外部 Agent 读写。MyDiary 没有这种桥。

### 1.2 核心理念

**让 MyDiary 知识库同时对人和 Agent 开放**——两条路并行，覆盖所有场景：

```
方式 A：本地 Markdown 文件（对人开放）         方式 B：MCP Server（对 Agent 开放）
─────────────────────────────                 ─────────────────────────────
给 Obsidian / Logseq / VSCode / 脚本           给 Trae / Claude Desktop / Cursor / Cline
零门槛、不依赖协议、任何能读文件的工具都能用       拿到结构化数据（不是裸文件）、支持向量搜索、可写回
```

### 1.3 和竞品的本质区别

| | 有道 LLM Wiki | MyDiary 这个方案 |
|---|---|---|
| Agent 在哪 | 必须装龙虾 AI Agent，有道云端托管 | **任意 Agent，任意位置** |
| 知识库在哪 | 有道云笔记云端（封闭） | **本地文件系统 + MCP 端点**（开放） |
| 谁能读 | 只能用有道的 Agent | **Obsidian / Trae / VSCode / Python 脚本 / 任何支持 MCP 的 Agent** |
| 封闭 / 开放 | 封闭生态 | **开放生态** |

---

## 二、方式 A：本地 Markdown 文件导出

### 2.1 目录结构

云端 D1 是 source of truth，单向导出到本地固定路径：

```
MyDiaryKnowledge/                          ← 固定路径（各平台不同）
├── README.md                              ← 总览：有哪些 KB、每个 KB 简介
├── 三国/                                   ← 每个 KB 一个文件夹（按 KB 名称）
│   ├── README.md                          ← KB 说明 + 分类树 + 页面数量
│   ├── 人物/                               ← 按分类建子目录
│   │   ├── 刘备.md
│   │   ├── 曹操.md
│   │   └── 关羽.md
│   └── 事件/
│       ├── 赤壁之战.md
│       └── 三顾茅庐.md
├── 读书/
│   └── ...
└── 路亚笔记/
    └── ...
```

### 2.2 单个 MD 文件格式

```markdown
---
title: 刘备
aliases: [刘玄德, 昭烈帝, 刘皇叔]
tags: [人物, 蜀汉, 核心]
kb: 三国
category: 人物
created: 2026-10-10
updated: 2026-10-12
backlinks: [曹操, 关羽, 张飞, 三顾茅庐, 赤壁之战]
source_url: https://app.callmydiary.online/kb/xxx
---

# 刘备

## 生平

刘备（161-223），字玄德...

## 核心事件

- [[三顾茅庐]] 请诸葛亮出山
- [[赤壁之战]] 联吴抗曹
- [[关羽]] 桃园结义

## 关系网

- **义兄弟**：[[关羽]]、[[张飞]]
- **对手**：[[曹操]]
- **谋士**：[[诸葛亮]]

---

> 本页面由 MyDiary 小麦 AI 自动维护
> 最近一次同步：2026-10-12 12:00
```

### 2.3 各平台固定路径

| 平台 | 路径 | 说明 |
|---|---|---|
| **Android（Capacitor）** | `Documents/MyDiaryKnowledge/` | 公共 Documents 目录，用户接电脑能看 |
| **iOS（Capacitor）** | `Documents/MyDiaryKnowledge/` | 同上 |
| **Web（桌面浏览器）** | OPFS（Origin Private File System）| 浏览器沙盒，通过 Capacitor Filesystem 暴露 |
| **Web（手机浏览器）** | 暂无（移动端浏览器不支持 OPFS 写）| → 鼓励用户下载 App 或走 MCP |

### 2.4 同步策略（MVP：单向）

```
云端 D1（主） ──全量/增量──▶ 本地文件
```

| 策略 | 说明 | 复杂度 | 实现 |
|---|---|---|---|
| 单向全量（MVP） | 每次启动或点「立即同步」按钮，从云端拉所有 KB + 所有 pages + 所有 links，完整覆盖本地 | 🟢 轻 | Worker 加 `GET /api/kb/export` → 返回完整 JSON |
| 单向增量 | 只导出 `updated_at > last_sync_at` 的页面 | 🟢 轻 | 加 `?since=timestamp` 参数 |
| 双向同步（暂不做） | Agent 改了本地 MD → App 检测到变化 → 回写云端 | 🔴 重（冲突解决）| Phase 3 再考虑 |

**冲突处理（MVP）**：云端是主。如果用户手动改了本地文件，App 下次同步会覆盖。加个提示：

```
检测到本地知识库有手动修改。
重新同步将覆盖所有本地改动，确定继续？
[取消]  [重新同步]
```

---

## 三、方式 B：MCP Server

### 3.1 什么是 MCP

**Model Context Protocol**（MCP）是 Anthropic 2025 年推出的 AI Agent 通用协议——让任何 AI Agent 用统一的方式调用外部工具和数据源。

简单理解：MCP Server = 一个暴露工具列表的 HTTP/SSE 端点，Agent 连上后就能调用这些工具。

### 3.2 MyDiary MCP 端点设计

**位置**：直接在 Cloudflare Worker 里加（不用额外部署）

**传输协议**：Streamable HTTP（Smithery / 阿里云百炼 都支持）

```
端点: https://app.callmydiary.online/mcp
协议: Streamable HTTP（SSE 也可以）
鉴权: Bearer <JWT>（复用现有 authUser() 逻辑）
```

### 3.3 MCP Tool 清单

#### Phase 1（只读，MVP）

| Tool | 说明 | 对应 Worker API |
|---|---|---|
| `my_diary_list_knowledge_bases()` | 列出用户所有知识库 | `GET /api/kb/list` |
| `my_diary_get_kb_structure(kb_id)` | 返回 KB 的分类树 + 所有页面 + 图谱链接 | `GET /api/kb/pages?kb_id=xxx` |
| `my_diary_search_kb(kb_id, query, top_k)` | 语义搜索（用 MyDiary 自己的 bge-m3 + ReRank）| `POST /api/kb/search` |
| `my_diary_get_page(kb_id, page_title)` | 返回完整 wiki 页 + 反链 + frontmatter | `GET /api/kb/page/:id` |
| `my_diary_ask_diary(query)` | 从用户日记里问答 | `POST /api/chat/ask`（type=diary）|
| `my_diary_ask_knowledge(kb_id, query, web)` | 从 KB 问答，可选联网补强 | `POST /api/chat/ask`（type=wiki）|
| `my_diary_get_diary_entries(date_from, date_to)` | 某个时间段的日记列表 | `GET /api/diary/entries` |
| `my_diary_list_diaries()` | 列出所有日记条目（精简版）| `GET /api/diary/entries` |
| `my_diary_get_my_profile()` | 用户资料（兴趣、偏好等）| `GET /api/profile/me` |

#### Phase 2（可写）

| Tool | 说明 |
|---|---|
| `my_diary_create_wiki_page(kb_id, title, content)` | Agent 帮写 KB 页面 |
| `my_diary_update_wiki_page(kb_id, page_title, patches)` | Agent 修改现有页面 |
| `my_diary_create_diary(date, content)` | Agent 帮写日记 |
| `my_diary_ingest_text_to_kb(kb_id, text)` | 丢一段文本让 MyDiary AI 整理进 KB |

### 3.4 工具调用流程（以 Trae 为例）

```
用户在 Trae 里说："帮我写一篇关于刘备的作文"

Trae 自动：
1. my_diary_list_knowledge_bases() → 发现有「三国」KB
2. my_diary_search_kb("三国", "刘备", top_k=5) → 拿到 5 个相关 wiki 页
3. my_diary_get_page("三国", "刘备") → 拿到完整内容 + 反链
4. my_diary_get_page("三国", "关羽") → 拿到完整内容
5. ...（自动追问相关页面）
6. 综合所有内容，生成作文
```

### 3.5 鉴权方案

复用现有 JWT，**不用改任何鉴权逻辑**：

```json
// Smithery / Trae / 百炼 配置
{
  "mcpServers": {
    "my-diary": {
      "url": "https://app.callmydiary.online/mcp",
      "headers": {
        "Authorization": "Bearer <用户的 MyDiary JWT>"
      }
    }
  }
}
```

Smithery 会自动帮用户处理 OAuth 登录（首次使用弹窗让用户授权 → 自动存 JWT）。

---

## 四、MCP 市场发布

### 4.1 第一档：说上就能上（Phase 1 同步）

| 市场 | 怎么上 | 难度 | 时间 |
|---|---|---|---|
| **Smithery.ai** | 填 URL（`https://app.callmydiary.online/mcp`）+ 描述 → 5 分钟 | ⭐ | 10 分钟 |
| **MCP.so** | GitHub Issue 提交 → 版主合并 | ⭐⭐ | 1 天 |
| **MCP 官方 Registry** | `mcp-publisher publish`（已有 callmydiary.online 域名 → namespace 自动过）| ⭐⭐ | 1 天 |

### 4.2 第二档：免费但要注册（Phase 1 同步）

| 市场 | 怎么上 | 难度 | 时间 |
|---|---|---|---|
| **阿里云百炼（通义千问）** | 控制台注册自定义 MCP → HTTP 安装方式 → 免费 | ⭐⭐ | 半天 |
| **Trae MCP 市场** | 联系 Trae 团队（你内部认识人更快）| ⭐⭐⭐ | 视关系 |

### 4.3 第三档：企业认证（Phase 3 可选）

| 市场 | 门槛 | 我们要不要做 |
|---|---|---|
| Microsoft Copilot Studio MCP 认证 | 已验证 Publisher + OAuth + 隐私政策 + 测试账号 | 如果有企业用户需求 |
| Claude 应用目录 | Claude Team + OAuth + 隐私政策 | 如果出海 |

---

## 五、实施计划

### Phase 1：单向导出 + 只读 MCP（1-2 周）

| # | 任务 | 改动层 | 工作量 |
|---|---|---|---|
| 1.1 | Worker 加 `GET /api/kb/export`（返回完整 KB 数据）| Worker | 0.5d |
| 1.2 | Capacitor App 加「同步到本地知识库」按钮 + 文件写入 | App | 1d |
| 1.3 | 导出的 MD 格式（frontmatter + `[[]]` 双向链接）| App | 0.5d |
| 1.4 | Worker 加 MCP Streamable HTTP 端点（Tool 描述 + 路由分发）| Worker | 1d |
| 1.5 | 9 个只读 MCP Tool 实现（调用现有 Worker API）| Worker | 1d |
| 1.6 | Smithery.ai / MCP.so / Registry 发布 | 运维 | 0.5d |
| 1.7 | 阿里云百炼注册 | 运维 | 0.5d |
| 1.8 | 测试：Trae 里配 MCP → 调 my_diary_search_kb | QA | 0.5d |
| | **合计** | | **~6d** |

### Phase 2：增量同步 + 写能力（2-3 周）

| # | 任务 |
|---|---|
| 2.1 | 本地文件增量同步（`?since=timestamp`）|
| 2.2 | 4 个可写 MCP Tool：create_page / update_page / create_diary / ingest_text |
| 2.3 | 写操作前二次确认（MCP Tool 调用有用户确认机制）|
| 2.4 | 本地文件变化回写云端（双向同步 MVP）|

### Phase 3：生态推广（长期）

| # | 任务 |
|---|---|
| 3.1 | Trae 团队沟通 → 上架 Trae MCP 市场 |
| 3.2 | 企业用户多的话 → 微软 Copilot Studio 认证 |
| 3.3 | 出海的话 → Claude 应用目录 |
| 3.4 | 做 Obsidian 插件（可选，用户可以直接把文件夹当 Vault）|

---

## 六、风险和未决问题

### 6.1 已决定

| 决策 | 结论 |
|---|---|
| 同步方向 | Phase 1 只做单向（云端→本地）|
| 写能力 | Phase 2 才做，Phase 1 MCP 只读 |
| 协议 | Streamable HTTP（MCP 最新标准）|
| Worker 部署 | 直接加在现有 Worker 里（不用独立部署）|

### 6.2 待决定

| 问题 | 选项 | 建议 |
|---|---|---|
| 本地文件权限 | 用 Capacitor Filesystem（沙盒）还是 SAF（Storage Access Framework，用户选目录）| SAF 更好——用户自己选目录，Agent 能直接读，但 Android 8+ 支持 |
| Web 端导出 | OPFS 还是纯下载按钮？| 纯下载按钮（`download.zip`）——最简单，用户解压到任意目录 |
| MCP 要不要限流？| 无限制 / 按 JWT 用户每天 N 次 | Phase 1 不限，观察用量再加 |
| 本地文件路径暴露 | MCP 返回里要不要带本地绝对路径？| 不带——Agent 用 MCP Tool 就够了，不需要知道本地路径 |

### 6.3 开放问题（暂不处理）

- 跨知识库桥接（多 KB 之间自动发现重叠实体）
- 知识库矛盾检测（多份资料说同一件事不一致）
- 知识库综合分析页（AI 跨页做总结）
- 双向同步冲突解决（Agent 改了 + App 也改了 → 谁赢）

这些都在竞品调研报告（wiki-research-llm-wiki-competitors.md）里详细分析过，有需要随时提。

---

## 七、附录

### 7.1 现有 Worker API 对应 MCP Tool

| MCP Tool | 现有 API | 实现难度 |
|---|---|---|
| my_diary_list_knowledge_bases | `GET /api/kb/list` | 🔴 还没做 |
| my_diary_get_kb_structure | `GET /api/kb/pages?kb_id=xxx` | 🟢 有（getKbPages）|
| my_diary_search_kb | `POST /api/kb/search` | 🟢 有（handleWikiSearch）|
| my_diary_get_page | `GET /api/kb/page/:id` | 🟢 有（getWikiPage）|
| my_diary_ask_diary | `POST /api/chat/ask` type=diary | 🟢 有（handleAsk）|
| my_diary_ask_knowledge | `POST /api/chat/ask` type=wiki | 🟢 有（handleWikiAsk）|
| my_diary_get_diary_entries | `GET /api/diary/entries` | 🟢 有（handleListEntries）|
| my_diary_list_diaries | `GET /api/diary/entries` | 🟢 有（同上，只做精简）|
| my_diary_get_my_profile | `GET /api/profile/me` | 🟢 有 |

**9 个 Tool 里 7 个是现成 Worker API 的薄包装**，只有 `list_knowledge_bases` 和 `export` 是新增。

### 7.2 Karpathy LLM Wiki 三层结构 vs 我们的导出

| Karpathy 原始 | 我们做 | 说明 |
|---|---|---|
| Layer 1: raw（原始素材，不可变）| ❌ 不做——我们的 wiki_pages 本身就是 AI 编译后的产物，不是原始素材 | 简化 |
| Layer 2: entities（实体页）| ✅ 做——就是 wiki_pages 按分类目录组织 | 对齐 |
| Layer 3: index（交叉引用）| ✅ 做——frontmatter 的 aliases / backlinks / `[[]]` 就是交叉引用 | 对齐 |
| Layer 4: manifest（维护日志）| ❌ 不做——我们用 `updated_at` + frontmatter 的同步时间戳 | 简化 |

### 7.3 MCP 认证流程（Smithery 自动处理）

```
用户在 Smithery 市场点「安装」
→ Smithery 弹窗让用户授权 MyDiary 账号
→ 用户登录 → MyDiary 返回 OAuth code
→ Smithery 换 token → 存起来
→ Smithery 调用 MCP Tool 时自动带 token
→ MyDiary Worker authUser() 拿到 user.uid → 查 D1 → 返回数据
```

Phase 1 可以**跳过 Smithery 自动 OAuth**，让用户手动填 JWT（简单，但用户体验差一点）。Phase 2 再接 Smithery OAuth。
