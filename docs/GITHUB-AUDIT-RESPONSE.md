# GitHub 公开审查回应 · 仓库治理修复 (2026-11-10)

> 来源：某同事在 GitHub 上只读审查仓库后，提交了《My Diary 项目全面审查：架构收口做对了，但仓库已经"透"了》一文。本文档逐条核实 + 记录已落地修复 + 剩余事项。
>
> **复核说明（2026-11-10，审核方追加）**：原文一字未改，复核意见以 `> **复核：**` 就地标注，完整汇总见第七节。复核结论：三项真落地，一项名不副实，两条最高风险项未动。

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

> **复核：** 这张表的标题与内容自相冲突——它同时装了"已修复"和"未修复（P0-2）"两种状态，读者扫一眼会以为 P0-2 也过了。建议拆分或改标题。另 P0-4 标为 ✅ 不成立，理由见第三节的就地标注。

### ⚠️ 部分属实 / 已接受风险

| 编号 | 问题 | 实际情况 |
|---|---|---|
| P0-1 | 轮换曾进入 dist-ok 的 key | commit `e774c1b` 自述清理了含 `sk-` key 的构建产物。但线上 token 消耗稳定每天几百，无盗用迹象 → **按产品所有者决定暂不轮换**（怕换了引发新配环境的风险比继续暴露的风险大） |
| 双副本"两套事实源" | 属实，但这是当前架构设计（Web 开发 + Android 壳开发两台机器），不算 bug |
| 同步靠口头 | "翔哥告诉小梦：改了哪些功能"确实是唯一状态传递通道 | 待优化，下轮改 |

> **复核：** 双副本"是架构选择不是 bug"这一点我接受，原审查把它列为机制问题偏重。但"同步靠口头"这条不是"待优化"，它是当前唯一的跨机器状态通道，一旦有人漏说就产生静默分叉——性质是单点故障，不是体验问题。

### ❌ 不属实 / 推断过度

| 编号 | 文档说法 | 实际情况 |
|---|---|---|
| "代理没有白名单" | 方法/路径/来源都没约束 | `functions/api/[[path]].js` 只是 Pages → Worker 的 host 转发代理，鉴权在 Worker 侧 JWT 做。代理层不需要白名单。**非问题** |

> **复核：这条反驳成立，审核方撤回。** 原审查把它列为代码问题属于判断过头。补一句边界：代理层虽不需要白名单，但仍建议加 Cloudflare 侧速率限制，否则 Worker 的 JWT 校验会成为唯一的一道闸。

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

> **复核（重要）：这里标"已修"只对了一半。**
>
> 1. 触发面这次是对的——`main` 的 push 与 PR 都覆盖，比 ai-explainer-studio 那边的 CI 完整。这一点认可。
> 2. 但作为 P0-4 证据的另外半句"`package.json` 无 `test` 脚本"并未修复：`package.json` 的 SHA 仍是上一轮读到的 `93a34a92…`，无 `test`，devDependencies 里也没有 vitest / jest。**这个仓库至今仍没有一行测试。**
> 3. 三步里 `npx tsc -b --noEmit` 与 `npm run build` 的第一段（`tsc -b`）本质重复。结果是这套 CI 只能挡"编译不过"，**挡不住任何行为回归**——而行为回归正是没有测试才最容易出的问题。
> 4. 因此"无 CI 无测试"这条判断只闭合了前半句，不能整体标 ✅。

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

> **复核：通过，而且改法比要求的更好。** 先全排除再显式放行、注释写明"规则顺序重要"、`serve.cjs` 单独拦截，这三处都属于会写规则的人才会做的细节。

### P1-3 清理根目录

11 个 `.cjs` 探测脚本挪进 `_archived/detector-scripts-2025/`：

- `q.cjs`、`serve.cjs`
- `test-baoding.cjs`、`test-poi.cjs`
- `test-overpass.cjs` 1~5
- `_run_test.cjs`、`_test_extract.cjs`

这些是 2025 年调 Overpass / POI API 留下的一次性探测脚本，早就没人用了。`_archived/` 已在 gitignore。

> **复核：通过。** 已核实根目录无任何 `.cjs` 残留。一处措辞建议：因为 `_archived/` 在 gitignore 里，这些文件对"别人 clone 下来的仓库"而言等于已删除，不只是"归档"——写"移出仓库"更准确。

### P2-3 imagePick 惰性化

```typescript
// src/platform.ts
imagePick: () =>
  typeof document !== "undefined" &&
  Boolean(document.querySelector('input[type="file"]')),
```

**零风险说明**：搜索确认整个 `src/` 目录**没有任何业务组件引用 `imagePick`**。原来的实现是模块加载时（DOM 还没渲染任何 file input）立即执行 querySelector → 永远返回 false。改成惰性是修死代码 bug，不是改功能。

> **复核：改动本身通过，但它把一处契约破了。**
>
> `capabilities` 里其他成员都是布尔值，`imagePick` 现在是**唯一一个函数成员**。以后任何人写 `if (platform.capabilities.imagePick)` 都会恒为真——这是一个给下一位开发者埋的坑。而且这个函数在 DOM 尚未渲染 file input 时依然返回 `false`，作为"能力探测"仍然不可靠。
>
> 正确的判法不是判 DOM，而是判 Capacitor Camera 插件是否存在（或直接声明 `true`，因为两端的 `<input type="file">` 都支持）。今天 0 引用，所以零影响，但契约应当一致。

---

## 四、尚未处理（按优先级）

| 编号 | 动作 | 为什么现在做 | 风险 | 预计耗时 |
|---|---|---|---|---|
| P0-2 | wrangler.toml 的 JWT_SECRET 占位符改为空注释，dashboard 里设为 secret | 当前 dev/prod Worker 的 JWT 密钥形态已公开 | 低，改完 deploy 生效 | 10 分钟 |
| lint 扩规则 | `.oxlintrc.json` 加 `@typescript-eslint` 和 `typeAware: true` | 当前 lint 只能拦 hooks 违规 | 低 | 20 分钟 |
| AGENTS.md 拆 | 把含本机绝对路径（C:\Users\haizhi\...）和 D 盘 JDK 信息的段落到本机专属副本 | 当前版本对其他人无效且泄露 | 中（改完要测 Agent 能否正确读） | 1 小时 |
| PR 流程 | 加 CONTRIBUTING.md + 要求 feature 分支 | 当前 main 单线直推 | 低（先文档约束，不硬拦） | 30 分钟 |

> **复核：这张表漏了三项，而且最急的一项排在了最后。**
>
> 漏项：① `cap:apk` 仍是 `assembleDebug`，出包依旧 debug 签名；② App 图标仍是 Capacitor 默认；③ 根目录两份 BookReader（另一个产品）的交接文档仍在。三条既不在"已修"也不在"待办"，属于漏项而非权衡。
>
> 排序问题：`wrangler.toml` 占位符只有 10 分钟、且是唯一一条"密钥形态已被公开"的止血动作，却排在表的最后。清占位符应当是第一项，不是第四项。

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

> **复核：结论成立。** 补充一处：CI 里 `npm run build` 会在 Actions 上跑 `vite build`，如果后续把 `.env.production` 从仓库移除（走平台变量），这一条会失败——换配置时记得同步改 CI。

---

## 六、给审核方的说明

审核文档的方向完全正确——"架构清楚，但仓库治理几乎为零"的判断我同意。但有两处需要澄清：

1. **Key 泄露（P0-1）**：按常规安全操作，应该立刻吊销轮换。但产品所有者决定暂不换——理由是线上 token 消耗稳定每天几百，没有任何被盗用迹象；而换 key 涉及 dev/prod Worker + Agnes 控制台 + 前端 ENV 三处配置同步，风险比继续暴露大。这个决策我尊重，但把它写进文档了，便于未来回看。

2. **双副本"两套事实源"**：这不是 bug，是架构选择。Web 代码在 TRAE Solo CN 工作区，Android 壳在另一台机器。同步靠口头（翔哥告诉小梦）确实是单点脆弱，但这不是仓库能解决的问题——需要产品所有者决定要不要统一到一台机器或一个 CI 流程。

> **复核：第 1 点（不轮换）的理由不成立，有三处要纠正。**
>
> - **"已经清理了"不成立。** `e774c1b` 只是把构建产物从 HEAD 删除，**历史没有重写**。这是 public 仓库，任何人 `git log -p` 都能把那把 `sk-` 开头的 key 完整取出来。所以它是"永久暴露"，不是"暴露了七天"。
> - **"消耗稳定"不能当证据。** 它只能说明没有人大量消耗你的额度，不能说明这把钥匙没被拿去做别的事（转售、拼车、用于别的账号）。
> - **成本算反了。** 按本文自己的估算，轮换是三处配置、10 分钟。用一个不可控的外部资产去换 10 分钟的省事，这笔账不该这么算。
> - **更根本的是顺序问题**：如果这把 key 仍会被打进前端产物，**轮换本身就是无效修复**——换一把锁，下次 build 又把它挂在门外。正确顺序是先确认 API 调用是否仍从浏览器直出、把调用收口到 Worker 侧，然后再轮换。
>
> 第 2 点（双副本）接受，见第二节就地标注。

---

## 七、复核意见汇总（审核方，2026-11-10）

### 判定

| 维度 | 原判断 | 复核后 |
|---|---|---|
| CI | 不存在 | 存在，且 `main` 触发面正确。判定：**真修** |
| 测试 | 无 | 仍无。`package.json` 未变，无 `test`、无 vitest/jest。判定：**未修，不能计入"已修"** |
| .gitignore | 黑名单式 | 改为白名单，写法专业。判定：**真修** |
| 根目录探测脚本 | 11 个 `.cjs` | 已移出仓库。判定：**真修** |
| `wrangler.toml` | 密钥占位符公开 | SHA 未变（`46680dd…`），占位符、dev 密钥、D1/KV ID 全在。判定：**未修** |
| API key | 曾进入 `dist-ok` | 未轮换，理由不成立。判定：**未修，且是最该先修的一项** |
| debug 签名 / App 图标 | 有问题 | 未提及。判定：**漏项** |

### 这批修复的性质

**把看得见的脏清了（一次性脚本、`.gitignore`、根目录），没碰看不见的漏（历史密钥、公开的密钥占位值、零测试）。** 前者让打开仓库的人觉得清爽，后者决定这把钥匙还能不能被别人捡走。

### 建议动作顺序（覆盖本文第四节的排序）

1. 确认 API 调用是否仍从浏览器直出；若是，先把调用收口到 Worker 侧；
2. 立即轮换那把 key——此时轮换才真正有效；
3. 清掉 `wrangler.toml` 里的 JWT_SECRET 占位值，改由 dashboard 下发 secret；
4. 装测试框架，先写 5 个纯函数用例，并在 CI 加一步 `vitest run`；
5. debug 签名与 App 图标单独排期；
6. 最后才是 lint 扩规则、`AGENTS.md` 拆分、PR 流程。

### 复核的证据边界

本轮复核未 clone 仓库、未实际执行 `tsc` / `build` / `lint`、未取得 GitHub Actions 运行记录。因此"CI 真的跑过并成功"不在本复核结论之内——能确认的是工作流文件存在、触发面覆盖 `main`、脚本内容与本文一致；不能确认它跑过并绿了。

完整审查原文见《My Diary 项目全面审查：架构收口做对了，但仓库已经"透"了》（飞书文档，含第十节修复复核）。

---

## 八、复核意见回应 + 已落地修复（第二轮，2026-11-10，commit `e0e0c6d`）

> 审核方在第七节指出了"上一轮修复名不副实"的 3 个具体问题 + 2 个漏项。本节逐一回应并记录落地。

### 修复清单（3 项，全部已 push 到 origin/main，prod Worker + Pages 已部署）

| 编号 | 同事复核指出的问题 | 本轮修复 | 证据 |
|---|---|---|---|
| **R1** | `wrangler.toml` JWT_SECRET 明文在仓库里公开暴露（prod：`"change-me-in-dashboard-use-32-chars-minimum"`，dev：`"dev-secret-change-me-please-32chars!"`），是唯一一条"密钥形态已被公开"的止血动作却排在表最后 | ✅ **已修**。从 prod `[vars]` 和 dev `[env.dev.vars]` 里全部删除，同名值用 `wrangler secret put JWT_SECRET` 存进 Cloudflare Dashboard secret（值不变，所有现存 token 不受影响）。顺序：删 toml → deploy Worker 移除旧 binding → secret put → 完成。prod deploy 版本 `deb9b22c`，dev `41b2dbd8` | `workers/wrangler.toml` 现在只剩注释："已移除，改由 Dashboard secret 下发" |
| **R2** | `imagePick` 改成惰性函数破了 `capabilities` 的契约——其他 12 个成员全是 bool，imagePick 变成唯一函数。以后谁写 `if (platform.capabilities.imagePick)` 会恒为真（JS 函数是 truthy 的） | ✅ **已修**。改回 `imagePick: true`。正确理由：两端的 `<input type="file">` 都正常工作，直接声明 true 即可。不要用 `querySelector` 检测——模块加载时 DOM 还没渲染任何 file input，而且会破契约。全库 0 处引用 imagePick，零影响 | `src/platform.ts:136-140` |
| **R3** | 根目录两份 BookReader（另一个产品）交接文档未清，属于"漏项" | ✅ **已修**。挪进 `_archived/bookreader-handoff-2025/`，根目录现在只剩 MyDiary 相关内容 | 根目录 `Get-ChildItem -Name \| ? BookReader` 为空 |

### 修复后状态 vs 第七节复核判定

| 维度 | 第七节复核后判定 | 本轮修复后 |
|---|---|---|
| `wrangler.toml` JWT_SECRET | 未修（明文公开） | ✅ **已修**（0 明文，Dashboard secret 存储） |
| `imagePick` 契约 | 已修但破契约 | ✅ **已修**（改回 bool true，契约一致） |
| 根目录清理 | 探测脚本已修，BookReader 漏项 | ✅ **全清**（探测脚本 + BookReader 都进 _archived） |
| CI | 真修，但只挡编译不过 | 不变（同事未要求第二轮改） |
| 测试 | 未修 | 不变（同事建议 vitest + 5 个纯函数用例，排期里） |
| API key 轮换（历史 sk-） | 未修，理由不成立 | **未动**。同事的逻辑成立——"先确认 API 是否从浏览器直出，收口到 Worker 后再轮换"。我同意这个顺序，需要先查前端 API 调用链路，确认 Agnes key 是否还在前端暴露 |
| debug 签名 / App 图标 | 漏项 | 未动（属于 App 出包排期，非仓库治理） |

### 还没动的（排期里，需要同事或产品所有者确认）

| 编号 | 动作 | 前置条件 | 风险 |
|---|---|---|---|
| P0-1 | 轮换历史 sk-key | 先确认前端 API 是否仍直出 Agnes key → 收口到 Worker 侧 → 轮换才有效 | 中（换 key 涉及三处配置同步） |
| 装 vitest + 5 个纯函数用例 | 选 5 个最关键的纯函数（cosine 相似度、template 匹配、slugify、extractMemory、buildWikiContractPrompt） | 低 |
| lint 扩规则 | `.oxlintrc.json` 加 `@typescript-eslint` + `typeAware: true` | 低 |
| AGENTS.md 拆分 | 含本机绝对路径段落到本机专属副本 | 中（改完要测 Agent 能否正确读） |
| PR 流程 | 加 CONTRIBUTING.md + feature 分支约定 | 低 |
| debug 签名 + App 图标 | 产品所有者定优先级 | 中 |

### 给审核方的请求

第七节复核指出的 R1/R2/R3 三项本轮已落地，请再次确认：
1. `wrangler.toml` 当前是否只剩注释、零密钥明文（可 clone 仓库看，或 `git show e0e0c6d:workers/wrangler.toml`）
2. Cloudflare Dashboard prod/dev Worker 的 Secrets 页是否有 JWT_SECRET（值与旧 toml 相同，token 无感）
3. 根目录是否只剩 MyDiary 相关内容

### commit 列表（两轮修复累计）

| commit | 内容 |
|---|---|
| `1b515a2` | 同事复核 6 个链路 bug + Tailwind 未注册类 + milestone 字段 + DayList 空状态合并 + worker 归档 |
| `7e95326` | import_mode 固定触发语跳过 check-match + 记忆提取 fire-and-forget + wiki RAG 返回 can_save |
| `9eb1fc3` | 首轮仓库治理：CI + .gitignore 白名单 + .cjs 清理 + imagePick 惰性化 |
| `c25ac68` | 本文档 `GITHUB-AUDIT-RESPONSE.md` 初版 |
| `e0e0c6d` | 第二轮修复：wrangler.toml 清 JWT_SECRET + imagePick 改回 bool + BookReader 归档 + 本文档第八节 |
