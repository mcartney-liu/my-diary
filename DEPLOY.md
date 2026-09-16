# MyDiary — 部署 & 运维手册

> 📍 **最高准则。所有部署操作必须照此执行。**

---

## ⚡ 3 秒速查

```
测试（先验证、无风险）：  https://mydiary-web-dev.pages.dev
生产（真实用户在用）：   https://mydiary-web.pages.dev

改前端 → 本地测 → wrangler pages deploy dist --project-name mydiary-web-dev → 你说 OK → mydiary-web
改后端 → wrangler deploy --env dev → tunnel 测 → 你说 OK → wrangler deploy（默认 prod）
改 D1  → dev D1 跑 SQL → 测 → prod D1 跑 SQL

每次改完必须：git add -A && git commit && git push
```

---

## 🗺️ 架构全景

```
用户浏览器
    │
    ├─ 访问 mydiary-web.pages.dev (生产)
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
| **前端 Pages** | **https://mydiary-web-dev.pages.dev** | **https://mydiary-web.pages.dev** | 给用户发这个 |
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
│   │   ├── 0001_init.sql
│   │   ├── 0002_feedback.sql
│   │   └── 0003_templates.sql
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
wrangler pages deploy dist --project-name mydiary-web-dev

# 3. 你在 dev 环境再确认一遍（iPhone 浏览器开 https://mydiary-web-dev.pages.dev）

# 4. 没问题 → 推生产
wrangler pages deploy dist --project-name mydiary-web

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
wrangler deploy         # 默认就是 prod（wrangler.toml 顶层配置）

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
wrangler pages deploy dist --project-name mydiary-web-dev
# → 你在 mydiary-web-dev.pages.dev 测

# 3. 测 OK → 生产 Worker + 生产前端
cd workers && wrangler deploy && cd ..
npm run build
wrangler pages deploy dist --project-name mydiary-web

# 4. commit + push
git add -A && git commit -m "feat: xxx (frontend + worker)" && git push
```

---

### 场景 4：改了 D1 表结构（SQL migration）

```bash
cd workers

# 1. 改 dev D1（随便玩，坏了就删）
wrangler d1 execute mydiary-db-dev --remote --file=migrations/0004_xxx.sql

# 2. dev Worker 部署 + 测试
wrangler deploy --env dev

# 3. 测 OK → 改 prod D1（⚠️ 不可逆！先确认 SQL 正确！）
wrangler d1 execute mydiary-db --remote --file=migrations/0004_xxx.sql

# 4. prod Worker 部署
wrangler deploy

# 5. commit + push（SQL 文件也要入库）
cd ..
git add -A && git commit -m "feat(d1): add xxx table" && git push
```

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
wrangler pages deploy dist --project-name mydiary-web-dev     # 推测试前端
wrangler pages deploy dist --project-name mydiary-web        # 推生产前端

# === 后端 workers/ ===
cd workers
wrangler deploy --env dev                               # 推 dev Worker
wrangler deploy                                        # 推 prod Worker
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

---

## 📋 Cloudflare Dashboard 速查

| 去哪看 | URL | 备注 |
|--------|-----|------|
| Pages 项目列表 | https://dash.cloudflare.com/?to=/:account/pages | mydiary-web + mydiary-web-dev |
| Worker 列表 | https://dash.cloudflare.com/?to=/:account/workers | mydiary-api + mydiary-api-dev |
| D1 数据库 | https://dash.cloudflare.com/?to=/:account/d1 | mydiary-db + mydiary-db-dev |
| JWT Secret（⚠️ 别乱改） | Worker → Settings → Variables | dev 和 prod 各有自己的 JWT_SECRET |

---

## 🧪 测试账号

| 环境 | 账号 | 密码 | 备注 |
|------|------|------|------|
| 生产 | test@test.com | test123456 | 真实数据 |
| 测试 | 自己注册 | 自己设 | dev D1 干净的，随便玩 |

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
