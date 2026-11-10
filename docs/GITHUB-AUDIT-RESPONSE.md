# GitHub 公开审查回应 · 仓库治理修复 (2026-11-10)

> 来源：某同事在 GitHub 上只读审查仓库后，提交了《My Diary 项目全面审查：架构收口做对了，但仓库已经"透"了》一文。本文档逐条核实 + 记录已落地修复 + 剩余事项。

## 一、审查文档结论摘要

审查方的核心结论：

- **做得好的**：`platform.ts` 单收口、双副本边界写死、文档密度、提交信息写根因
- **最危险的**：public 仓库 + 历史泄露过 `sk-` key + 无 CI 无测试
- **最该先做**：不是重构，是"把 platform.ts 那种收口思维，从平台差异扩展到密钥、配置、文档、发布"

---

## 二、逐条核实（事实 vs 文档说法）

### ✅ 完全属实（已修复或已确认）

| 编号 | 问题 | 证据 | 修复状态 |
|---|---|---|---|
| P0-2 | `wrangler.toml` 把 JWT_SECRET 占位符公开 | `workers/wrangler.toml:12` 写死 `"change-me-in-dashboard-use-32-chars-minimum"`，dev 环境是 `"dev-secret-change-me-please-32chars!"` | 未修复（见下文"待定"） |
| P0-3 | 仓库 public | `gh repo view` 确认为 public | 用户决策，暂不转 private |
| P0-4 | 无 CI | `.github/workflows/` 不存在，`package.json` 无 `test` 脚本 | ✅ **已修**（见第三节） |
| P1-1 | `.gitignore` 黑名单式 | 只排除 `.env` / `.env.local` / `.env.*.local` | ✅ **已修**（白名单） |
| P1-3 | 根目录 11 个 `.cjs` 探测脚本暴露 | `q.cjs`、`test-overpass.cjs` 1-5、`test-poi.cjs`、`test-baoding.cjs`、`serve.cjs`、`_run_test.cjs`、`_test_extract.cjs` | ✅ **已修**（归档） |
| P2-3 | `imagePick` 模块加载时执行 querySelector 恒为 false | `src/platform.ts:137-139` | ✅ **已修**（惰性化） |
| lint 空转 | `.oxlintrc.json` 只开 2 条规则 | 属实，暂不扩 | 待定 |
| 无 LICENSE / SECURITY.md | 四个文件均不存在 | 属实 | 待定 |

### ⚠️ 部分属实 / 已接受风险

| 编号 | 问题 | 实际情况 |
|---|---|---|
| P0-1 | 轮换曾进入 dist-ok 的 key | commit `e774c1b` 自述清理了含 `sk-` key 的构建产物。但线上 token 消耗稳定每天几百，无盗用迹象 → **按产品所有者决定暂不轮换**（怕换了引发新配环境的风险比继续暴露的风险大） |
| 双副本"两套事实源" | 属实，但这是当前架构设计（Web 开发 + Android 壳开发两台机器），不算 bug |
| 同步靠口头 | "翔哥告诉小梦：改了哪些功能"确实是唯一状态传递通道 | 待优化，下轮改 |

### ❌ 不属实 / 推断过度

| 编号 | 文档说法 | 实际情况 |
|---|---|---|
| "代理没有白名单" | 方法/路径/来源都没约束 | `functions/api/[[path]].js` 只是 Pages → Worker 的 host 转发代理，鉴权在 Worker 侧 JWT 做。代理层不需要白名单。**非问题** |

---

## 三、已落地修复（commit `9eb1fc3`）

### P0-4 加最小 CI

新建 `.github/workflows/ci.yml`：

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npm run lint                # oxlint
      - run: npx tsc -b --noEmit         # 类型检查
      - run: npm run build               # 生产构建
```

**零风险说明**：CI 只跑三条静态检查命令，不连 prod/dev Worker 也不连 D1。push 即生效，GitHub Actions 自动执行。

### P1-1 .gitignore 改白名单

```diff
- .env
- .env.local
- .env.*.local
+ .env*
+ !.env.app
+ !.env.production
+ !.env.example
```

**零风险说明**：gitignore 规则只影响"未来新文件"，已经入库的 `.env.app` / `.env.production`（只有 API 地址，不含密钥）不会被移除追踪。

### P1-3 清理根目录

11 个 `.cjs` 探测脚本挪进 `_archived/detector-scripts-2025/`：

- `q.cjs`、`serve.cjs`
- `test-baoding.cjs`、`test-poi.cjs`
- `test-overpass.cjs` 1~5
- `_run_test.cjs`、`_test_extract.cjs`

这些是 2025 年调 Overpass / POI API 留下的一次性探测脚本，早就没人用了。`_archived/` 已在 gitignore。

### P2-3 imagePick 惰性化

```typescript
// src/platform.ts
imagePick: () =>
  typeof document !== "undefined" &&
  Boolean(document.querySelector('input[type="file"]')),
```

**零风险说明**：搜索确认整个 `src/` 目录**没有任何业务组件引用 `imagePick`**。原来的实现是模块加载时（DOM 还没渲染任何 file input）立即执行 querySelector → 永远返回 false。改成惰性是修死代码 bug，不是改功能。

---

## 四、尚未处理（按优先级）

| 编号 | 动作 | 为什么现在做 | 风险 | 预计耗时 |
|---|---|---|---|---|
| P0-2 | wrangler.toml 的 JWT_SECRET 占位符改为空注释，dashboard 里设为 secret | 当前 dev/prod Worker 的 JWT 密钥形态已公开 | 低，改完 deploy 生效 | 10 分钟 |
| lint 扩规则 | `.oxlintrc.json` 加 `@typescript-eslint` 和 `typeAware: true` | 当前 lint 只能拦 hooks 违规 | 低 | 20 分钟 |
| AGENTS.md 拆 | 把含本机绝对路径（C:\Users\haizhi\...）和 D 盘 JDK 信息的段落到本机专属副本 | 当前版本对其他人无效且泄露 | 中（改完要测 Agent 能否正确读） | 1 小时 |
| PR 流程 | 加 CONTRIBUTING.md + 要求 feature 分支 | 当前 main 单线直推 | 低（先文档约束，不硬拦） | 30 分钟 |

---

## 五、这次改动是否影响线上功能

**不影响。** 理由：

| 改动 | 线上影响 |
|---|---|
| CI yml | 不部署，只在 push 时跑检查 |
| .gitignore | 纯本地规则，跟线上无关 |
| 挪 .cjs | 只改仓库文件结构 |
| imagePick 惰性化 | 搜过 0 处引用，死代码修复 |

prod Pages 和 Worker 无需重新部署（Worker 完全没改，前端只改了 platform.ts 里没人用的一行）。如要同步部署，build + deploy 各一条命令即可。

---

## 六、给审核方的说明

审核文档的方向完全正确——"架构清楚，但仓库治理几乎为零"的判断我同意。但有两处需要澄清：

1. **Key 泄露（P0-1）**：按常规安全操作，应该立刻吊销轮换。但产品所有者决定暂不换——理由是线上 token 消耗稳定每天几百，没有任何被盗用迹象；而换 key 涉及 dev/prod Worker + Agnes 控制台 + 前端 ENV 三处配置同步，风险比继续暴露大。这个决策我尊重，但把它写进文档了，便于未来回看。

2. **双副本"两套事实源"**：这不是 bug，是架构选择。Web 代码在 TRAE Solo CN 工作区，Android 壳在另一台机器。同步靠口头（翔哥告诉小梦）确实是单点脆弱，但这不是仓库能解决的问题——需要产品所有者决定要不要统一到一台机器或一个 CI 流程。
