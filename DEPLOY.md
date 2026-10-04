# MyDiary — 部署 & 运维手册

> 📍 **最高准则。所有部署操作必须照此执行。**

---

## ⚡ 3 秒速查

```
测试（先验证、无风险）：  https://mydiary-web-dev.pages.dev
生产（真实用户在用）：   https://app.callmydiary.online

改前端 → 本地测 → wrangler pages deploy dist --project-name mydiary-web-dev → 你说 OK → mydiary-web
改后端 → wrangler deploy --env dev → tunnel 测 → 你说 OK → wrangler deploy --env=""（prod）
改 D1  → dev D1 跑 SQL → 测 → prod D1 跑 SQL

每次改完必须：git add -A && git commit && git push
```

---

## 🗺️ 架构全景

```
用户浏览器
    │
    ├─ 访问 app.callmydiary.online (生产)
    │   ├── 静态资源 (HTML/CSS/JS/字体)
    │   └── Pages Functions (/api/*) ──► mydiary-api.mcartneyliu.workers.dev
    │                                    + D1: mydiary (真实用户数据)
    │
    ├─ 访问 mydiary-web-dev.pages.dev (测试)
    │   ├── 静态资源
    │   └── Pages Functions (/api/*) ──► mydiary-api-dev.mcartneyliu.workers.dev
    │                                    + D1: mydiary-db-dev (干净测试库)
    │
    └─ 本地 localhost:5173 (npm run dev)
        ├── 静态资源 (Vite HMR)
        └── Vite proxy (/api/*) ──► mydiary-api-dev.mcartneyliu.workers.dev
                                     + D1: mydiary-db-dev
```

### 🧠 Pages Functions 智能路由

`functions/api/[[path]].js` 里有一段根据 host 自动选后端的逻辑：

```js
const isDev = request.headers.get('host')?.includes('-dev.pages.dev');
const workerHost = isDev
  ? 'mydiary-api-dev.mcartneyliu.workers.dev'   // dev Pages → dev Worker
  : 'mydiary-api.mcartneyliu.workers.dev';      // prod Pages → prod Worker
```

**所以前端部署到哪个 Pages 项目，它自己就会连对应的 Worker。前端代码里写的是相对路径 `/api/*`，不用改！**

---

## 🌐 地址速查

| 类型 | 测试环境 | 生产环境 | 备注 |
|------|---------|---------|------|
| **官网（落地页）** | — | **https://callmydiary.online** | 独立 Pages 项目 mydiary-site |
| **前端 Pages** | **https://mydiary-web-dev.pages.dev** | **https://app.callmydiary.online** | 注册/登录/主应用（自定义域名，推荐给用户） |
| ↑ 同一个项目 | — | https://mydiary-web.pages.dev | Cloudflare 自动分配的 pages.dev 地址，和上面是同一个 mydiary-web 项目，两个都能访问 |
| **后端 Worker** | https://mydiary-api-dev.mcartneyliu.workers.dev | https://mydiary-api.mcartneyliu.workers.dev | 前端不直连，走 Pages Functions 同域代理 |
| **D1 数据库** | `mydiary-db-dev` | `mydiary-db` | 完全隔离 |
| GitHub | https://github.com/mcartney-liu/my-diary | 同左 | |
| Cloudflare Dashboard | https://dash.cloudflare.com | 同左 | |

---

## 📁 项目结构

```
mydiary-web/
│
├── src/                          # 前端源码 (React + Vite + TypeScript)
│   ├── main.tsx                  # 入口（字体恢复 + iOS Safari 重绘 hack）
│   ├── App.tsx
│   ├── api.ts                    # API 客户端（全部相对路径 /api/*）
│   ├── AuthContext.tsx
│   ├── index.css                 # ⭐ Tailwind + 全局字体 + iOS hack
│   ├── components/
│   │   ├── ProfilePage.tsx       # 设置、字体切换、反馈、模板库
│   │   ├── EditorPage.tsx        # 编辑器
│   │   ├── TextBlock.tsx        # 文本块
│   │   └── ...
│   └── ...
│
├── public/
│   ├── fonts/                    # MaShanZheng.ttf + Kalam.ttf（本地字体，不走 Google Fonts）
│   ├── papers/                   # 信纸背景图片
│   ├── _redirects                # SPA fallback: /* /index.html 200
│   ├── favicon.svg
│   └── icons.svg
│
├── functions/
│   └── api/
│       └── [[path]].js           # ⭐ Pages Functions: 按 host 智能代理到 dev/prod Worker
│
├── workers/                      # 后端 Worker (JavaScript) — ⭐ 当前在用的
│   ├── src/
│   │   ├── index.js              # Worker 主路由
│   │   └── auth.js               # PBKDF2 + JWT
│   ├── migrations/
│   │   └── 0001 ~ 0018_*.sql           # D1 迁移（手动 execute 跑，不用 migrations apply）
│   └── wrangler.toml             # ⭐ prod (默认) + [env.dev] 双环境
│
├── worker/                       # 后端 Worker (TypeScript + AI) — 开发中/并行
│   ├── src/index.ts
│   └── wrangler.jsonc
│
├── vite.config.ts                # Vite 配置（dev proxy → dev Worker）
├── tailwind.config.js            # Tailwind（含自定义 font-family）
├── package.json
└── DEPLOY.md                     # 你正在看的这个文件
```

---

## 🚀 部署场景

### 场景 1：只改了前端（90% 的情况）

**改了 src/、public/、functions/ — 没碰 workers/src/**

```bash
# 1. 本地跑
npm run dev
# → 打开 localhost:5173 自己看 + iPhone 连 tunnel

# 2. 测 OK（你说 OK）→ 先推测试环境
npm run build
wrangler pages deploy dist --project-name mydiary-web-dev --commit-dirty=true --skip-caching

# 3. 你在 dev 环境再确认一遍（iPhone 浏览器开 https://mydiary-web-dev.pages.dev）

# 4. 没问题 → 推生产
wrangler pages deploy dist --project-name mydiary-web --commit-dirty=true --skip-caching

# 5. commit + push
git add -A && git commit -m "feat: xxx" && git push
```

**生产前端推送后立刻生效，无需等待构建。**

---

### 场景 2：只改了后端 Worker

**改了 workers/src/index.js 或 workers/src/auth.js**

```bash
cd workers

# 1. 先推 dev Worker（不影响生产！）
wrangler deploy --env dev

# 2. 前端 dev 环境（localhost 或 mydiary-web-dev.pages.dev）自动连 dev Worker
#    直接测就行

# 3. 测 OK → 推生产 Worker
wrangler deploy --env=""           # prod Worker（空 env = 顶层配置，消除 warning）

# 4. commit + push
cd ..
git add -A && git commit -m "feat(worker): xxx" && git push
```

---

### 场景 3：前后端都改了

```bash
# 1. 先推 dev Worker（让前端 dev 环境有新接口可以调）
cd workers && wrangler deploy --env dev && cd ..

# 2. 推 dev 前端 + 整体测
npm run build
wrangler pages deploy dist --project-name mydiary-web-dev --commit-dirty=true --skip-caching
# → 你在 mydiary-web-dev.pages.dev 测

# 3. 测 OK → 生产 Worker + 生产前端
cd workers && wrangler deploy --env="" && cd ..
npm run build
wrangler pages deploy dist --project-name mydiary-web --commit-dirty=true --skip-caching

# 4. commit + push
git add -A && git commit -m "feat: xxx (frontend + worker)" && git push
```

---

### 场景 4：改了 D1 表结构（SQL migration）

```bash
cd workers

# 1. 改 dev D1（随便玩，坏了就删）
wrangler d1 execute mydiary-db-dev --remote --file migrations/xxxx.sql

# 2. dev Worker 部署 + 测试
wrangler deploy --env dev

# 3. 测 OK → 改 prod D1（⚠️ 不可逆！先确认 SQL 正确！）
wrangler d1 execute mydiary-db --remote --file migrations/xxxx.sql

# 4. prod Worker 部署
wrangler deploy --env=""

# 5. commit + push（SQL 文件也要入库）
cd ..
git add -A && git commit -m "feat(d1): add xxx table" && git push
```

### 4.1 ⚠️ Prod / Dev D1 结构漂移排查（v0.5.2 新增，踩过 4 次坑）

**背景**：prod D1 跑的 migration 比 dev 少（历史原因：之前没严格走 migration 流程），导致 dev 正常、prod 各种 `no such column` / `NOT NULL constraint failed`。

**踩过的坑**：

| 现象 | 根因 | 怎么发现的 |
|---|---|---|
| 创建官方 KB → 500 `no such column: description` | prod wiki_knowledge_bases 缺 description 列 | 用户报告后查 PRAGMA |
| 添加资料 → 500 `NOT NULL: wiki_sources.kb_id` | prod wiki_sources.kb_id 是 NOT NULL，dev 已改可空（支持全局资料不打标签） | 用户报告后查 PRAGMA |
| 美食菜谱库只有 1 个分类 | prod wiki_templates 只有 12 个官方模板，dev 有 40 个；seed 时 recipe/ingredient 模板缺失被跳过 | 用户报告后对比 builtin_key 数量 |

**铁律：每次发布前先跑 prod/dev D1 schema 对比**

```powershell
# === 一键对比所有 wiki_ 表的列 ===
$tables = @("wiki_knowledge_bases","wiki_categories","wiki_pages","wiki_sources","wiki_links","wiki_templates","wiki_debug_log")
foreach ($t in $tables) {
  Write-Output "=== TABLE: $t ==="
  Write-Output "--- PROD ---"
  $p = npx wrangler d1 execute mydiary-db --remote --command "PRAGMA table_info($t);" 2>$null | Select-String '"name":' | ForEach-Object { ($_.Line -replace '.*"name": "', '') -replace '",.*', '' }
  Write-Output $p
  Write-Output "--- DEV ---"
  $d = npx wrangler d1 execute mydiary-db-dev --remote --command "PRAGMA table_info($t);" 2>$null | Select-String '"name":' | ForEach-Object { ($_.Line -replace '.*"name": "', '') -replace '",.*', '' }
  Write-Output $d
  # 也对比 notnull（prod 可能还是 NOT NULL 但 dev 已改可空）
  Write-Output "--- PROD notnull ---"
  $pnn = npx wrangler d1 execute mydiary-db --remote --command "PRAGMA table_info($t);" 2>$null | Select-String '"notnull":' | ForEach-Object { ($_.Line -replace '.*"notnull": ', '') -replace ',.*', '' }
  Write-Output $pnn
  Write-Output "--- DEV notnull ---"
  $dnn = npx wrangler d1 execute mydiary-db-dev --remote --command "PRAGMA table_info($t);" 2>$null | Select-String '"notnull":' | ForEach-Object { ($_.Line -replace '.*"notnull": ', '') -replace ',.*', '' }
  Write-Output $dnn
}

# === 对比官方模板数量 ===
Write-Output "=== 官方模板数量 ==="
$prodTpls = npx wrangler d1 execute mydiary-db --remote --command "SELECT builtin_key FROM wiki_templates WHERE user_id='system' AND kb_id IS NULL;" 2>$null | Select-String '"string"'
$devTpls = npx wrangler d1 execute mydiary-db-dev --remote --command "SELECT builtin_key FROM wiki_templates WHERE user_id='system' AND kb_id IS NULL;" 2>$null | Select-String '"string"'
Write-Output "prod: $($prodTpls.Count)  dev: $($devTpls.Count)"

# === 对比官方 KB 分类 ===
Write-Output "=== 各 KB 分类数量 ==="
foreach ($env in @("mydiary-db-dev","mydiary-db")) {
  Write-Output "--- $env ---"
  npx wrangler d1 execute $env --remote --command "SELECT k.title, COUNT(c.id) as cnt FROM wiki_knowledge_bases k LEFT JOIN wiki_categories c ON c.kb_id=k.id WHERE k.is_official=1 GROUP BY k.id ORDER BY k.title;" 2>$null | Select-String '"title"|"cnt"' | ForEach-Object { $_.Line.Trim() }
}
```

**发现差异后怎么修**

| 差异类型 | 修法 |
|---|---|
| prod 缺列 | `ALTER TABLE xxx ADD COLUMN yyy TEXT DEFAULT '';`（SQLite 只支持加列） |
| prod 列还是 NOT NULL，dev 已改可空 | SQLite 不能 ALTER NOT NULL → **重建表**：`CREATE TABLE xxx_new (...可空...); INSERT INTO xxx_new SELECT * FROM xxx; DROP TABLE xxx; ALTER TABLE xxx_new RENAME TO xxx;`（⚠️ 先 SELECT COUNT(*) 确认数据量小！） |
| prod 缺官方模板 | 从 dev 导出 → INSERT OR IGNORE 到 prod（用 Node 脚本转 JSON → SQL） |
| prod KB 分类少 | 先确认模板已补齐（上一步），再手动 INSERT 缺的 category（extract_hints + page_format 从 wiki_templates 子查询取） |

**已修复的漂移记录（供参考）**

| 日期 | 差异 | 修复 SQL |
|---|---|---|
| 2026-09-29 | prod wiki_knowledge_bases 缺 description 列 | `ALTER TABLE wiki_knowledge_bases ADD COLUMN description TEXT DEFAULT '';` |
| 2026-09-29 | prod wiki_templates 缺 category 列 | `ALTER TABLE wiki_templates ADD COLUMN category TEXT DEFAULT '通用';` |
| 2026-09-29 | prod wiki_sources.kb_id NOT NULL（dev 已改可空） | 重建 wiki_sources 表，kb_id 改为 TEXT 无约束；2 条数据无损保留 |
| 2026-09-29 | prod wiki_templates 只有 12 个官方模板（dev 40 个） | Node 脚本从 dev 导出 40 条 → INSERT OR IGNORE 到 prod |
| 2026-09-29 | prod 美食菜谱库缺菜谱+食材分类（模板之前缺失被跳过） | 手动 INSERT 2 条 wiki_categories，extract_hints/page_format 从 wiki_templates 子查询取 |

---

## 🔑 wrangler.toml 详解

文件：`workers/wrangler.toml`

```toml
name = "mydiary-api"                    # ← 生产 Worker 名（默认）
main = "src/index.js"

[[d1_databases]]
binding = "DB"
database_name = "mydiary-db"
database_id = "ed7e7954-5f55-439c-a76a-228f1124512b"

[env.dev]                               # ← 测试环境
name = "mydiary-api-dev"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "mydiary-db-dev"
database_id = "fb45cce8-c051-4f20-a560-ea2dc3cadb26"
```

| 命令 | 用的配置 | 部署到 |
|------|---------|--------|
| `wrangler deploy` | 顶层（无 env） | `mydiary-api` + `mydiary-db` |
| `wrangler deploy --env dev` | `[env.dev]` 块 | `mydiary-api-dev` + `mydiary-db-dev` |

---

## 🛠️ 常用命令速查

```bash
# === 前端 ===
npm run build                                           # 构建 dist/
wrangler pages deploy dist --project-name mydiary-web-dev --commit-dirty=true --skip-caching     # 推测试前端
wrangler pages deploy dist --project-name mydiary-web --commit-dirty=true --skip-caching        # 推生产前端

# === 后端 workers/ ===
cd workers
wrangler deploy --env dev                               # 推 dev Worker
wrangler deploy --env=""                                  # 推 prod Worker（空 env = 顶层配置）
cd ..

# === D1 ===
wrangler d1 list                                        # 看所有 D1 数据库
wrangler d1 execute mydiary-db-dev --remote --file=xxx.sql   # dev D1 跑 SQL
wrangler d1 execute mydiary-db --remote --file=xxx.sql      # prod D1 跑 SQL
wrangler d1 execute mydiary-db-dev --remote --command="SELECT * FROM users"  # 直接跑一行 SQL

# === Git ===
git status
git add -A && git commit -m "xxx"
git push origin main
git log --oneline -5

# === 本地开发 ===
npm run dev                                             # localhost:5173 (Vite)
```

---

## ⚠️ 红色警报：绝对不能做的事

| ❌ 禁止 | ✅ 正确做法 |
|---------|-----------|
| 改完 Worker 直接 `wrangler deploy` | 先 `wrangler deploy --env dev` 测 |
| 改完前端直接推生产 | 先推 dev Pages → 你在 dev 环境确认 |
| 手动操作 prod D1 改数据 | 要改先改 dev D1，SQL 验证正确再跑 prod |
| dev 数据和 prod 混用 | 两套 D1 完全隔离，数据不会串 |
| 忘记 commit + push | 每次改完都 `git add -A && git commit && git push` |
| 在 Cloudflare Dashboard 里手动改配置 | 所有改动走代码 + wrangler，保证可回滚 |
| **修改已发布的旧版本 changelog** | **旧版本内容永远不动，只在顶部新增当前版本** |
| **用 PowerShell `Set-Content` 写 JSON/TS 文件** | **会加 UTF-8 BOM，PostCSS/Node 读炸。用 `[System.IO.File]::WriteAllText($path, $c, (New-Object Text.UTF8Encoding $false))`** |

### 📝 Changelog 维护铁律（v0.2.1 踩过的坑）

**规则：已发布的版本记录 = 历史档案，永远只读。**

```
✅ 正确：每次发版只在最顶部新增一个版本块，旧版本原样保留
❌ 错误：把 v0.2.0 的详细内容压成灰字摘要、删掉条目、改写措辞

为什么？
- 用户点「关于 → 更新记录」是来看看历史版本都改了啥
- 已经对外展示过的旧版本突然变了 → 信息不可信
- 如果想精简旧版本视觉层级 → 用 CSS（字号、颜色），不是改内容
```

**两个地方要同步更新（必须一致）：**

| 位置 | 文件 | 说明 |
|------|------|------|
| App 内弹窗 | `src/components/ProfilePage.tsx` | 用户点「关于 → 版本」弹出的 changelog |
| Git 仓库 | `CHANGELOG.md` | 根目录的版本记录文件 |

**版本号两处对齐：**

| 位置 | 文件 |
|------|------|
| `package.json` | `"version": "0.2.1"` |
| `vite.config.ts` | `__APP_VERSION__: JSON.stringify("0.2.1")` |
| changelog 弹窗 | `<span>v{__APP_VERSION__}</span>` ← 用动态变量，不要硬编码！ |

### ✍️ Changelog 写作风格规范（对齐 v0.2.0 / v0.2.1 风格）

**核心原则：写给用户看，不是写给开发者看。先看 v0.2.0 / v0.2.1 怎么写的，照它的段落分类、emoji、措辞风格来。**

#### 段落分类（按实际内容选，不用全有）

| 段落 | emoji | 放什么 |
|------|-------|--------|
| 🎉 新功能 | 第一次出现的用户能感知到的能力（新页面、新交互、新入口） |
| 🐛 Bug 修复 | 之前坏了现在好了的东西 |
| 🔧 交互改进 | 不是新功能也不是修 bug，但体验变好了的（空模板拦截这种） |
| 📚 运维文档 | 加了或改了哪些文档 |
| 🏗️ 架构 | 后端/数据库/部署层面的变化，用户感知不到但记录一下 |
| 🛡️ （独立段） | 解决了深层问题的（重复日记三道防线这种），段落名自己取，emoji 用 🛡️ |
| 📦 本次改动文件 | 表格列出所有改动的文件，"全新" 两个字标新文件 |

#### 标题格式（每条都这样，照抄 v0.2.1 的样子）

```
- **emoji 功能名** — 主描述（一句话说清是什么）
  - 子 bullet 补充细节（如果需要，用两个空格缩进）
```

#### 用词禁忌（绝对不能出现）

| ❌ 不要写（英文/技术词） | ✅ 要写（中文/用户视角） |
|---------|--------|
| hover | 鼠标悬停 |
| X 轴 | 日期轴 |
| TOP5 / top 3 | 前几名 |
| localStorage | 本地缓存 |
| uid / id | 唯一标识 |
| justify-start → justify-end | 柱子方向改了 |
| migration 0005 | 之前每次保存都生成新标识 |
| finance_item / summarizeDay / dedupeDiaries | 能识别收支流水了 / 修了重复日记 |
| Worker / D1 / SQL / JWT | 后端 / 数据库 |

#### 写作前必做四步（v0.3.1 定版的铁律）

1. **先跑 `git diff v0.X.0 HEAD --stat`** — 看清楚从上次发布到现在改了哪些文件，不漏任何一个
2. **逐个文件扫一遍 diff** — 确认哪些是新功能、哪些是 bug 修复、哪些是重构
3. **对照 v0.2.0 / v0.2.1 的写法** — 段落分类、emoji 使用、子 bullet 层级、标题格式完全一致
4. **草稿先给用户审** — 不要写进 CHANGELOG.md + ProfilePage.tsx + 推 dev，等用户说 OK 再动文件

#### 两个版本记录文件必须同步

- `CHANGELOG.md`（Git 仓库里的）
- `src/components/ProfilePage.tsx`（App 内弹窗里的）
- **内容必须一字不差（段落、措辞、bullet 顺序、emoji）**

---

## 🧾 发版 Checklist（每次 release 必须走完）

```
□ 1. CHANGELOG.md 最顶部新增当前版本块（旧版本不动）
□ 2. ProfilePage.tsx changelog 弹窗最顶部新增当前版本块（旧版本不动）
□ 3. vite.config.ts __APP_VERSION__ +1  ← 唯一真实来源
□ 4. npm run build → 无报错
□ 5. git add -A && git commit -m "release: vX.X.X — 描述"
□ 6. wrangler pages deploy dist --project-name mydiary-web-dev --commit-dirty=true --skip-caching → dev 测
□ 7. 用户在 dev 环境确认 OK
□ 8. wrangler pages deploy dist --project-name mydiary-web --commit-dirty=true --skip-caching → 推生产
□ 9. git push origin main
```

---

## 📋 Cloudflare Dashboard 速查

| 去哪看 | URL | 备注 |
|--------|-----|------|
| Pages 项目列表 | https://dash.cloudflare.com/?to=/:account/pages | mydiary-web + mydiary-web-dev |
| Worker 列表 | https://dash.cloudflare.com/?to=/:account/workers | mydiary-api + mydiary-api-dev |
| D1 数据库 | https://dash.cloudflare.com/?to=/:account/d1 | mydiary-db + mydiary-db-dev |
| JWT Secret（⚠️ 别乱改） | Worker → Settings → Variables | dev 和 prod 各有自己的 JWT_SECRET |

---

## 🔍 Wiki 知识库日志排查（v0.5.5 更新）

### 背景

Agent 本机无法连接 `*.workers.dev`（DNS 劫持 + 网络层深包检测），WebSocket 长连接（`wrangler tail`、miniflare remote）全部秒断。
**解决办法**：Worker 把关键日志写入 D1 表 `wiki_debug_log`，用 `wrangler d1 execute` 查——这是短 HTTP，始终能通。

### 日志通路

```
Worker 执行 wiki 汇入（或任何 handler 抛出 fatal）
  → dblog(env, 'ingest' | 'fatal' | 'diary' | 'ai', <MSG>, { ... })
  → INSERT INTO wiki_debug_log (id TEXT, ts INTEGER, tag TEXT, msg TEXT, data TEXT)
  → Agent 用 wrangler d1 execute --remote SELECT 查出来
```

### Tag 对照表

| tag | 覆盖范围 | 写入位置 |
|-----|---------|---------|
| `ingest` | 知识库汇入全链路 | workers/src/wiki.js（37 处） |
| `check_match` | 知识库匹配分类（AI） | workers/src/wiki.js（8 处） |
| `fatal` | **全局兜底** — 所有 handler 未 catch 的异常 | workers/src/index.js（全局 try/catch） |
| `diary` | 写日记保存失败 | workers/src/index.js |
| `ai` | AI 问答失败 / embedding reindex 失败 | workers/src/index.js |
| `auth` | 登录后 last_login_at 更新失败 | workers/src/index.js |

### msg 字段速查（wiki.js 写入）

| msg | 含义 | data 里有啥 |
|-----|------|------------|
| `START` | 汇入开始 | kb_id, kb_title |
| `LLM_ENV` | 检查 DeepSeek 配置 | hasEndpoint, hasKey, endpointPrefix, model |
| `LLM_DEEPSEEK_OK` | DeepSeek 调用成功 | contentLen |
| `LLM_DEEPSEEK_EMPTY` | content 为空（可能思考链没关） | respPreview |
| `LLM_DEEPSEEK_FALLBACK_REASONING` | content 空但 reasoning_content 有，兜底捞出来 | len |
| `LLM_DEEPSEEK_EXCEPTION` | DeepSeek 网络异常 | msg |
| `LLM_DEEPSEEK_HTTP_ERR` | DeepSeek 返回 4xx/5xx | status, err |
| `LLM_DEEPSEEK_RETRY` | 第 N 次重试 | attempt |
| `LLM_NO_SECRETS` | DEEPSEEK_API_KEY 没配 | — |
| `LLM_FALLBACK_WORKERS` | fallback 到 Workers AI llama | model |
| `AI_RAW` | AI 原始返回 | preview（前 500 字） |
| `AI_FAIL` | AI 调用超时/异常 | error |
| `PARSE_FAIL` | JSON 解析失败 | steps（每步错误原因）+ head + tail |
| `PARSED_OK` | 解析成功 | pages, links, page_cats |
| `VALIDATED` | slug 白名单校验通过 | validSlugs |
| `SLUG_INVALID` | AI 返回了白名单外的 slug | badSlug, validSlugs |
| `PAGE_INSERT` | 新建页面 | title, slug |
| `PAGE_UPDATE` | 更新页面 | title, slug |
| `SOURCE_SKIP` | 某条 source 被跳过（batch_fail） | id, reason |
| `ISOLATED` / `ISOLATED_FIXED` | 孤儿页面自动补链 | title, linkedTo |
| `DONE` | 全部完成 | ingested, totalPending, created, updated, links |

### msg 字段速查（index.js 写入）

| msg | 含义 | data 里有啥 |
|-----|------|------------|
| （全局 catch 无 msg） | 任意 handler 抛异常 | msg, stack（前 300 字） |
| `SAVE_FAIL` | 写日记主流程崩了 | msg, stack |
| `ASK_FAIL` | AI 问答崩了 | msg, stack |
| `REINDEX_FAIL` | embedding 重建崩了 | msg |
| `LOGIN_TIME_FAIL` | 登录后 last_login_at 更新失败 | msg |

### 查表必备命令

```bash
# === prod 环境 ===
cd workers
DB=mydiary-db

# 最新 20 条
wrangler d1 execute $DB --remote --command "SELECT ts, tag, msg, substr(data,1,300) as data FROM wiki_debug_log ORDER BY ts DESC LIMIT 20"

# 只看 fatal 错误（所有 handler 未 catch 的异常）
wrangler d1 execute $DB --remote --command "SELECT * FROM wiki_debug_log WHERE tag='fatal' ORDER BY ts DESC"

# 只看 ingest 链路
wrangler d1 execute $DB --remote --command "SELECT * FROM wiki_debug_log WHERE tag='ingest' ORDER BY ts DESC"

# 今天的所有日志（ts 是毫秒时间戳）
wrangler d1 execute $DB --remote --command "SELECT * FROM wiki_debug_log WHERE ts > 1727740800000 ORDER BY ts DESC"

# 按时间范围查
wrangler d1 execute $DB --remote --command "SELECT msg, data FROM wiki_debug_log WHERE ts >= 1790638314000 ORDER BY ts ASC"

# === dev 环境（pages.dev 测试时用这个！）===
DB=mydiary-db-dev
# 同上命令，换 DB 名
```

### 常见问题排查流程

**问题 1：页面没按分类显示**
```sql
-- 查页面实际 category
SELECT p.title, c.name as cat, c.slug FROM wiki_pages p
JOIN wiki_categories c ON p.category_id=c.id
WHERE p.kb_id='<kb_id>' ORDER BY c.name;

-- 查 AI 本轮返回的 page_cats
SELECT data FROM wiki_debug_log WHERE msg='PARSED_OK' ORDER BY ts DESC LIMIT 1;
```

**问题 2：三国内容混进美食 KB**
```sql
-- 查 source 的 kb_id
SELECT id, title, kb_id FROM wiki_sources WHERE kb_id IS NULL;
-- 根因：之前代码漏了 AND kb_id IS NOT NULL，NULL 的 source 被自动匹配进来了
```

**问题 3：AI 一直返回空 content**
```
dblog 里连续 LLM_DEEPSEEK_EMPTY（content 为 ""）
→ 根因：deepseek-v4-flash 默认开思考链，正式回复走 reasoning_content
→ 代码已加 thinking: { type: "disabled" } + reasoning_content 兜底
→ 如果还发生：查 DEEPSEEK_API_KEY 是否有权限，或换 deepseek-chat 模型
```

**问题 4：LLM_DEEPSEEK_OK 但 PARSE_FAIL**
```
→ 根因：AI 输出 JSON 里有 trailing comma、裸反斜杠、尾部截断
→ dblog 的 steps 数组会告诉你每一步 parse 卡在哪
→ repairAiJson 四层修复：原生 parse → 去 trailing comma → LaTeX 反斜杠 → 截断到最后 }
```

**问题 5：wiki_debug_log 全是空的（最坑的坑！）**
```sql
-- 先查表结构
PRAGMA table_info(wiki_debug_log);
-- dev：id TEXT PRIMARY KEY（正确）
-- prod：id INTEGER PRIMARY KEY（错误！uuid() 字符串插 INTEGER → SQLITE_MISMATCH → 被 catch {} 吞了）

-- 修复 prod：
ALTER TABLE wiki_debug_log RENAME TO wiki_debug_log_old;
CREATE TABLE wiki_debug_log (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, tag TEXT, msg TEXT, data TEXT);
DROP TABLE wiki_debug_log_old;
-- ✅ 2026-10-01 已修复
```

### AI 调用配置（v0.5.5 换了 DeepSeek）

| 项 | 旧值 | 新值 |
|----|------|------|
| 模型 | agnes-3.0-flash | **deepseek-v4-flash** |
| 环境变量 | AGNES_ENDPOINT / AGNES_API_KEY | **DEEPSEEK_API_KEY**（endpoint 硬编码在代码里） |
| 请求参数 | temperature: 0.1 | + **thinking: { type: "disabled" }**（必须关思考链） |
| Endpoint | 可变 | **https://api.deepseek.com/v1/chat/completions** |

请求体（workers/src/wiki.js line 58）：
```json
{ "model": "deepseek-v4-flash", "messages": [...], "max_tokens": 4096, "temperature": 0.1, "thinking": { "type": "disabled" } }
```

**必须关思考模式**：deepseek-v4-flash 默认开思考链，正式回复塞到 reasoning_content，content 是空字符串。代码双保险：请求时 thinking disabled + 响应时 content 为空 fallback reasoning_content。

### 关键环境变量

| Secret | 位置 | 用途 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | Worker → Settings → Variables | DeepSeek API Key，dev 和 prod **各配一份** |

**DeepSeek 优先 Workers AI 兜底**，代码见 `workers/src/wiki.js` 的 `wikiCallLLM` 函数（重试 2 次后 fallback）。

---

### 已发现的 prod/dev schema 漂移（继续之前的记录）

| 日期 | 差异 | 修复 |
|---|---|---|
| 2026-10-01 | prod wiki_debug_log.id 是 INTEGER，dev 是 TEXT | 重建 prod 表，id 改为 TEXT PRIMARY KEY |

---

## 🧪 测试账号

| 环境 | 账号 | 密码 | 备注 |
|------|------|------|------|
| 生产 | test@test.com | test123456 | 真实数据 |
| 测试 | 181810136@qq.com | liuxiang520 | dev D1，干净测试库 |

---

## 🖋️ 字体系统说明

### 字体文件
- `public/fonts/MaShanZheng.ttf` — 中文钢笔手写（5.6MB）
- `public/fonts/Kalam.ttf` — 英文手写

两套字体**本地存放**，不走 Google Fonts（国内被墙）。

### 字体切换链路
```
用户在「我的 → 设置 → 字体样式」选一个
    → setFontSetting()
    → localStorage.setItem("mydiary_font", "hand")
    → document.documentElement.setAttribute("data-font", "hand")  ← html
    → document.body.setAttribute("data-font", "hand")           ← body
    → CSS 里 html[data-font="hand"] { font-family: Kalam, "Ma Shan Zheng", ... }
    → 全局所有元素自动继承 ✅
```

### iOS Safari 特殊处理
iOS WebKit 有个已知 bug：`font-display: swap` + 大字体下载完后，已渲染的文字**不自动重绘**。

修复方案（`main.tsx` + `index.css`）：
```js
// 等 @font-face 全部加载完
document.fonts.ready.then(() => {
  document.documentElement.classList.add("fonts-loaded");
});
```
```css
/* 强制 WebKit 重新布局所有文字 */
html.fonts-loaded * {
  -webkit-text-stroke: 0.001px transparent;
}
```

---

## 📊 用户行为追踪

### activity_logs 表（v0.5.2 新增，迁移 0018）

记录用户关键行为，用于运营统计。

| action 值 | 触发 API | detail 字段 |
|---|---|---|
| `register` | POST /api/auth/register | null |
| `login` | POST /api/auth/login | null |
| `save_diary` | POST /api/diaries | { id, template_id } |
| `delete_diary` | DELETE /api/diaries | { id, force } |
| `change_password` | POST /api/auth/change-password | null |

### 常用查询

```bash
# 今天注册了几个用户？（<今天0点毫秒时间戳> 替换成实际值，比如 2026-09-24 00:00 = 1790438400000）
wrangler d1 execute mydiary-db --remote --command="SELECT COUNT(*) FROM activity_logs WHERE action='register' AND created_at >= <今天0点毫秒时间戳>"

# 某个用户最近做了什么？
wrangler d1 execute mydiary-db --remote --command="SELECT action, detail, datetime(created_at/1000,'unixepoch','+8') as time FROM activity_logs WHERE user_id='<用户ID>' ORDER BY created_at DESC"

# 今天谁在写日记？
wrangler d1 execute mydiary-db --remote --command="SELECT u.email, COUNT(*) as saves FROM activity_logs al JOIN users u ON u.id=al.user_id WHERE al.action='save_diary' AND al.created_at >= <今天0点毫秒时间戳> GROUP BY u.email"
```

### last_login_at 字段（v0.5.2 修复）

users.last_login_at 在**注册**和**登录**时都会更新（毫秒时间戳）。之前只在登录时更新，注册用户永远为 0。

```bash
# 查 DAU（今天登录过的唯一用户数）
wrangler d1 execute mydiary-db --remote --command="SELECT COUNT(*) FROM users WHERE last_login_at >= <今天0点毫秒时间戳>"
```

---

## 🎬 官网视频对应表（v0.5.2 新增）

官网 Hero 区 mockup 点击交互对应视频文件，视频源文件在本地：
`C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-fresh\output\`

### 视频文件清单

| 本地文件 | 对应 mockup 点击区域 | videoMap label | R2 上传状态 |
|---------|-------------------|----------------|------------|
| `MyDiaryIntro.mp4` | ✍️ 写日记按钮 | `写日记` | ❌ 待上传 |
| `CalendarIntro.mp4` | 📅 月历 tab | `年度回顾` | ❌ 待上传 |
| `YearlyIntro.mp4` | 📊 年度 tab | `年度回顾` | ❌ 待上传 |
| `XiaomaiIntro.mp4` | 💬 小麦 tab | `小麦：AI 聊天` | ❌ 待上传 |
| `WikiIntro.mp4` | 🌳 知识 tab | `知识库：LLM Wiki` | ❌ 待上传 |
| `DelightIntro.mp4` | 🎠 跑马灯 | `彩蛋：跑马灯与每日一句话` | ❌ 待上传 |
| `FamilyIntro.mp4` | ❓ 待定（可能是"我的"） | `我的` | ❌ 待上传 |
| — | 🎤 语音快记按钮 | `语音快记` | ❌ 无单独视频，可能含在 DelightIntro 里 |

**带音乐版本**（bgm/ 子目录）：`*__calm.mp4`、`MyDiaryIntro__piano.mp4`，可选后续替换。

### 当前状态

- 视频 URL 全部为空字符串 `""`，点 mockup 会弹出 Modal 但无视频内容
- 待上传 R2 后，填到官网 `index.html` 的 `videoMap` 对象里

### 上传命令（待执行）

```powershell
# R2 bucket 待创建
# 上传示例：
npx wrangler r2 object put mydiary-assets/videos/MyDiaryIntro.mp4 --file="C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-fresh\output\MyDiaryIntro.mp4"
```

### 官网源码位置

- 官网项目：`mydiary-web-site/`（独立于主 app 的静态站点）
- 官网地址：`https://callmydiary.online`
- videoMap 定义：`index.html` 内 `<script>` 块的 `const videoMap = {...}`
- 视频 Modal HTML：`index.html` 内 `<div id="video-modal">`

---

## 📝 与 AI 协作时的关键词

| 你说 | 我做 |
|------|------|
| "改一下 xxx" | 改代码 → 本地 dev + tunnel 测 → 你说 OK → 推 dev Pages |
| "测一下" | 已推 dev Pages 了，等你在 dev 环境确认 |
| "部署生产" / "推生产" | dev 环境已确认 OK → 推 mydiary-web.pages.dev |
| "隧道地址" | 告诉你当前可用的 tunnel URL |
| "字体" | 字体系统相关改动走 src/index.css + main.tsx + ProfilePage.tsx |

---

## 🔄 回滚方案

### 前端回滚
Cloudflare Pages 每次部署都会保留快照：
1. Dashboard → Pages → mydiary-web → Deployment history
2. 找到上一个好的版本 → "Promote to production"
3. 或者本地 `npm run build` + `wrangler pages deploy dist --project-name mydiary-web` 重新推

### Worker 回滚
```bash
cd workers
npx wrangler deployments list                        # 看历史版本
npx wrangler deployments rollout <deployment_id>     # 回滚到指定版本
```

### D1 回滚
⚠️ D1 不支持自动回滚。**改 prod D1 之前必须先在 dev D1 验证 SQL 正确！**

---

**核心铁律：改后端先 dev 测，改前端先 dev Pages 推了再确认，每次 commit + push。**
