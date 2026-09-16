# MyDiary — 部署与环境指南

> 📍 **这份文档是最高准则。所有部署操作必须照此执行。**

---

## ⚡ 3 秒速查（最重要的规则）

```
你/同事访问的固定地址：
  生产：https://mydiary-web.pages.dev        ← 永远不变，发给同事这个
  测试：https://oil-liberty-word-journal.trycloudflare.com  ← 当前隧道地址

改代码后的流程：
  改前端 → 本地 dev + 隧道测 → 你说 OK → wrangler pages deploy
  改后端 → wrangler deploy --env dev → 隧道测 → 你说 OK → wrangler deploy
  改 D1  → dev D1 跑 SQL 测 → prod D1 跑 SQL

每次改完都要：git add -A && git commit && git push
```

---

## 🗺️ 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        开发 & 测试                                   │
│                                                                     │
│  localhost:5173 (npm run dev)                                       │
│  oil-liberty-word-journal.trycloudflare.com (cloudflared 隧道)      │
│       │                                                             │
│       └── vite proxy ──► mydiary-api-dev.mcartneyliu.workers.dev    │
│                             + mydiary-db-dev (干净数据库)            │
├─────────────────────────────────────────────────────────────────────┤
│                          生产                                        │
│                                                                     │
│  mydiary-web.pages.dev                                              │
│       │                                                             │
│       └── Pages Functions ──► mydiary-api.mcartneyliu.workers.dev  │
│                                + mydiary-db (真实用户数据)          │
└─────────────────────────────────────────────────────────────────────┘
```

**原则：开发和生产完全隔离。改坏 dev → prod 不受影响。**

---

## 📁 项目结构

```
mydiary-web/
├── src/                      # 前端源码 (React + Vite)
│   ├── App.tsx
│   ├── api.ts                # API 客户端 (默认相对路径 /api/*)
│   ├── AuthContext.tsx
│   ├── components/           # 所有 UI 组件
│   └── ...
├── functions/
│   └── api/
│       └── [[path]].js       # Pages Functions: /api/* → Worker 代理
├── public/
│   └── _redirects            # Pages 路由规则: /api/* 交给 Functions, 其他 SPA fallback
├── vite.config.ts            # Vite 配置 (dev proxy → dev Worker)
├── .env.dev                  # Vite dev 指向 dev Worker
│
├── workers/                  # 后端 (Cloudflare Worker + D1)
│   ├── src/
│   │   ├── index.js          # Worker 主路由
│   │   └── auth.js           # PBKDF2 + JWT
│   ├── migrations/
│   │   └── 0001_init.sql     # D1 建表 SQL
│   └── wrangler.toml         # ⭐ 关键：prod (默认) + [env.dev] 两套配置
│
└── DEPLOY.md                 # 你正在看的这个文件
```

---

## 🔑 两套 Worker + 两套 D1

| | 测试 (dev) | 生产 (prod) |
|---|---|---|
| Worker 名 | `mydiary-api-dev` | `mydiary-api` |
| URL | `https://mydiary-api-dev.mcartneyliu.workers.dev` | `https://mydiary-api.mcartneyliu.workers.dev` |
| D1 数据库 | `mydiary-db-dev` (干净) | `mydiary-db` (真实用户数据) |
| 谁连它 | localhost dev + trycloudflare 隧道 | Pages 生产 |
| 部署命令 | `wrangler deploy --env dev` | `wrangler deploy` (默认) |

wrangler.toml 里 `[env.dev]` 块是 dev 配置，无 `[env.xxx]` 是 prod 配置。

---

## 🚀 部署场景

### 场景 1：只改了前端（90% 的情况）

**改了 src/ 下的文件，没碰 workers/src/**

```bash
# 1. 本地测
npm run dev          # 起 localhost:5173，自动连 dev Worker
# 隧道已经开着了，直接 iPhone 连 https://oil-liberty-word-journal.trycloudflare.com

# 2. 测 OK（你说 OK）→ 部署生产前端
npm run build
wrangler pages deploy dist --project-name mydiary-web

# 3. commit + push（每次改完都要做）
git add -A && git commit -m "feat: xxx" && git push
```

**只影响前端，后端不动。生产 Worker 不受影响。**

---

### 场景 2：只改了后端（Worker）

**改了 workers/src/index.js 或 auth.js，也可能改了 SQL**

```bash
cd workers

# 1. 先部署到 dev Worker（不影响生产！）
wrangler deploy --env dev

# 2. 隧道 + iPhone 测（vite proxy 已经连 dev Worker 了）

# 3. 测 OK（你说 OK）→ 部署生产 Worker
wrangler deploy

# 4. commit + push
cd ..
git add -A && git commit -m "feat(worker): xxx" && git push
```

**关键：先 `--env dev` 测，确认没 bug 再 `wrangler deploy`（默认 prod）。**

---

### 场景 3：前后端都改了

**同时改了 src/ 和 workers/src/**

```bash
# 1. 先部署 dev Worker
cd workers && wrangler deploy --env dev && cd ..

# 2. 隧道 + iPhone 整体测

# 3. 测 OK → 生产 Worker + 生产前端
cd workers && wrangler deploy && cd ..
npm run build
wrangler pages deploy dist --project-name mydiary-web

# 4. commit + push
git add -A && git commit -m "feat: xxx (frontend + worker)" && git push
```

**顺序：dev Worker → 测 → prod Worker → prod 前端**

---

### 场景 4：改了 D1 表结构（SQL migration）

```bash
cd workers

# 1. 先改 dev D1（随便造，坏了就删了重建）
wrangler d1 execute mydiary-db-dev --remote --file=migrations/0002_xxx.sql

# 2. dev Worker 部署 + 测试
wrangler deploy --env dev

# 3. 测 OK → 改 prod D1
wrangler d1 execute mydiary-db --remote --file=migrations/0002_xxx.sql

# 4. prod Worker 部署
wrangler deploy
```

---

## ⚠️ 红色警报：绝对不能做的事

| ❌ 禁止 | ✅ 正确做法 |
|---|---|
| 改完 Worker 直接 `wrangler deploy` | 先 `wrangler deploy --env dev` 测 |
| 改完前端直接 deploy 不本地测 | 先 localhost + 隧道测 |
| 手动操作 prod D1 改数据 | 要改先改 dev D1，验证 SQL 正确再跑 prod |
| dev 数据和 prod 混用 | 两套 D1 完全隔离，数据不会串 |
| 忘记 commit + push | 每次改完都 `git add -A && git commit && git push` |

---

## 🛠️ 常用命令速查

```bash
# === 前端 ===
npm run dev                              # 本地开发 (连 dev Worker)
npm run build                            # 构建
wrangler pages deploy dist --project-name mydiary-web   # 部署生产前端

# === 后端 (workers/) ===
wrangler deploy --env dev                # 部署 dev Worker
wrangler deploy                          # 部署 prod Worker (默认)

# === D1 ===
wrangler d1 execute mydiary-db-dev --remote --file=xxx.sql   # dev D1 跑 SQL
wrangler d1 execute mydiary-db --remote --file=xxx.sql      # prod D1 跑 SQL
wrangler d1 list                                               # 看所有 D1

# === 隧道 ===
cloudflared tunnel --url http://localhost:5173   # 快速隧道 (挂了重开)

# === Git ===
git status                               # 看改了啥
git add -A && git commit -m "xxx"        # commit
git push origin main                     # push 到 GitHub
```

---

## 🌐 地址速查

| 用途 | URL | 备注 |
|---|---|---|
| **测试隧道（当前）** | **https://oil-liberty-word-journal.trycloudflare.com** | ✅ 你测代码用这个 |
| **生产前端（固定）** | **https://mydiary-web.pages.dev** | 发给同事这个，永远不变 |
| 生产 Worker | https://mydiary-api.mcartneyliu.workers.dev | 前端不直连，通过 Pages Functions 走同域 |
| Dev Worker | https://mydiary-api-dev.mcartneyliu.workers.dev | 本地/dev 隧道用 |
| GitHub | https://github.com/mcartney-liu/my-diary | 代码仓库 |

> ⚠️ trycloudflare.com 是 Quick Tunnel（免费无账号），cloudflared 挂了重启后地址会变。
> 如果隧道挂了，我重新跑 `cloudflared tunnel --url http://localhost:5173` 拿新地址。

---

## 🧪 测试账号

### Prod:
- test@test.com / test123456

### Dev (干净的，随便注册):
- 自己随便注册，dev D1 空的

---

## 📝 与 AI 协作时的关键词

你跟我说以下任何一句，我就知道该做什么：

| 你说 | 我做 |
|---|---|
| "改一下 xxx" | 改代码 → dev Worker（如果改了后端）→ 隧道测 |
| "测一下" / "部署一下" | 你确认 OK → prod Worker（如果改了后端）→ pages deploy |
| "隧道地址" | 给你当前 trycloudflare.com 地址 |
| "挂了" / "隧道挂了" | 重新开 cloudflared，给你新地址 |

---

**核心铁律：改后端先 dev 测，改前端本地测了就 deploy。每次 commit + push。**
