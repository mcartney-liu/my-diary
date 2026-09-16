# MyDiary — 部署与环境指南

## 🗺️ 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        开发 & 测试                                   │
│                                                                     │
│  localhost:5173 (npm run dev)                                       │
│  trycloudflare.com (cloudflared tunnel → localhost:5173)            │
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
# 隧道：cloudflared tunnel --url http://localhost:5173
# iPhone 连隧道测

# 2. 测 OK → 部署生产前端
npm run build
wrangler pages deploy dist --project-name mydiary-web

# 3. commit + push
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

# 2. 本地 + 隧道测（已经连 dev Worker 了）
npm run dev
# iPhone 测

# 3. 测 OK → 部署生产 Worker
wrangler deploy

# 4. commit + push（在 workers/ 或项目根）
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

# 2. 前端 build + 本地测
npm run dev

# 3. 隧道 + iPhone 整体测

# 4. 测 OK → 生产 Worker + 生产前端
cd workers && wrangler deploy && cd ..
npm run build
wrangler pages deploy dist --project-name mydiary-web

# 5. commit + push
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
cloudflared tunnel --url http://localhost:5173   # 快速隧道 (每次地址变)

# === Git ===
git status                               # 看改了啥
git add -A && git commit -m "xxx"        # commit
git push origin main                     # push 到 GitHub
```

---

## 🌐 地址速查

| 用途 | URL | 备注 |
|---|---|---|
| 生产前端 | **https://mydiary-web.pages.dev** | 发给同事这个 |
| 生产 Worker | https://mydiary-api.mcartneyliu.workers.dev | 前端不直连，通过 Pages Functions 走同域 |
| Dev Worker | https://mydiary-api-dev.mcartneyliu.workers.dev | 本地/dev 隧道用 |
| GitHub | https://github.com/mcartney-liu/my-diary | 代码仓库 |

---

## 🧪 测试账号

### Prod:
- test@test.com / test123456

### Dev (干净的，随便注册):
- 自己随便注册，dev D1 空的

---

**记住：改后端 = 先 dev 测，再 prod。改前端 = 本地测了就 deploy 就行。**
