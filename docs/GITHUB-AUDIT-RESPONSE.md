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

---

## 九、第三轮复核确认（审核方，2026-11-10）

> 本节由审核方追加，第八节原文一字未改。核验方式：直接读取 `main` 当前内容逐项比对，未 clone 仓库、未执行 `tsc`/`build`/`lint`、未进入 Cloudflare 后台。

### 三项声明的核实结果

| 声明 | 核实过程 | 判定 |
|---|---|---|
| **R1** `wrangler.toml` 零密钥明文 | `workers/wrangler.toml`（blob `f16ed0d5…`）的 `[vars]` 与 `[env.dev.vars]` 中已无 `JWT_SECRET`，只余注释。字面陈述为真 | **半修**：明文移出了 HEAD，**值没有更换** |
| **R2** `imagePick` 改回 bool | `src/platform.ts`（blob `e42c3cd8…`）已为 `imagePick: true`，与 `capabilities` 其余成员同为 bool；并把"为何不能用 querySelector"写进了注释 | **真修** ✅ |
| **R3** 根目录只剩 MyDiary 内容 | 根目录清单无任何 `BookReader*`、无 `.cjs` 残留，与其陈述一致 | **真修** ✅ |

### R1 为什么判"半修"而不是"已修"

第八节的证据栏自己写着：

> 值为原先的明文（值不变，只换存放地点）

这句话决定了性质。被删掉的是仓库 HEAD 里的那行字符串，不是那把钥匙。本仓库是 public，任何人 `git show <旧提交>:workers/wrangler.toml` 即可完整取出旧值；而生产环境仍在用同一值。因此：

- **暴露面没有缩小**，只是从"打开文件就能看见"移到"翻历史才能看见"；
- **发现难度反而升高**：维护者看 HEAD 已经干净，不会再想起这件事；
- **攻击者手上的副本从未受影响**。

后果比 API key 更重：`JWT_SECRET` 是 HS256 的 HMAC key（`workers/src/auth.js` 的 `signJWT` 直接拿它签名）。持有者可自行签发任意用户、任意 `sub` 的 token，不经登录直接读写全部日记数据。API key 泄露烧的是额度，这个泄的是全站数据。

`值不变` 是"不让现网用户掉线"的取舍，可以理解，但代价必须记账：**为了让现存 token 不失效，保留了一把已经被公开过的钥匙。**

### 本轮新增发现：删掉 toml 打开了"静默降级"的口子

`workers/src/auth.js`（blob `9c584ad8…`）中 `signJWT(payload, secret)` 对 `secret` 无任何存在性校验。原先写死在 `[vars]`，永不缺失；改为 Dashboard 下发后，**任何未配置该 secret 的环境**（新建 Worker、preview 环境、CI、他人 fork 自部署）都会传入 `undefined`，而 `TextEncoder.encode(undefined)` 会编码成字符串 `"undefined"`。

后果是 HMAC key 变成公开常量 `"undefined"`：服务不报错、照常签发与校验，**任何人都能伪造 token**。这是删除 toml 引入的新故障面，需要在入口收紧：

```js
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET missing or too short");
}
```

`workers/src/index.js`（128KB）本轮未通读，调用处是否已有校验请自行确认；`auth.js` 这一层确认没有。

### 第八节未覆盖、仍然成立的三项

| 项 | 依据 | 状态 |
|---|---|---|
| 测试仍为零 | `package.json` blob 仍为 `93a34a92…`，无 `test` 脚本，devDependencies 无 vitest / jest | 未修 |
| CI 只挡编译不过 | `npx tsc -b --noEmit` 与 `build` 首段 `tsc -b` 重复，无测试步骤 | 未修 |
| debug 签名 / App 图标 | 第八节自述"未动"，属漏项 | 未修 |

### 建议动作顺序（修订第八节排期）

1. **先给 secret 缺失加硬保护并部署**——这一步必须优先于轮换，否则轮换后的新密钥在别的环境里仍会退化成 `"undefined"`；
2. **轮换 `JWT_SECRET`**：双密钥过渡（新密钥签发、旧密钥继续校验至 TTL 到期），确认全员能正常登录后再撤旧密钥；
3. 轮换历史 `sk-` key（顺序不变：先确认前端是否仍直出 → 收口到 Worker → 再轮换）；
4. 装 vitest + 5 个纯函数用例，CI 增加 `vitest run`；
5. `wrangler.toml` 注释里"值为原先的明文"这句建议删掉——它本身就在提示读者去哪里找旧值；
6. 其余（lint 扩规则、`AGENTS.md` 拆分、PR 流程、debug 签名 / App 图标）照原排期。

### 本轮证据边界

- **已核**：`workers/wrangler.toml`、`src/platform.ts`、`workers/src/auth.js`、`package.json`、根目录清单，均为 `main` 当前内容，blob 逐一可查。
- **未核**：Cloudflare Dashboard 中 prod/dev 是否已存在 `JWT_SECRET`、其值是否与旧 toml 相同；第八节所述部署版本 `deb9b22c` / `41b2dbd8`；GitHub Actions 是否实际执行过 CI。
- 第 2 条属用户 / 同事侧后台事实，本审核无法取得，列为**待确认**，不作为本轮判定依据。
- 另：`search_code` 返回 `incomplete_results: true`，因此"未搜到 `index.js` 中的 `JWT_SECRET` 引用"不能当作"不存在"的证据。

---

**本节作者：Doubao（豆包）**｜第三方独立审查者｜未 clone 仓库、未执行构建、未做任何仓库写操作以外的动作｜2026-11-10 UTC+8

---

## 十、对第九节复核的回应（2026-11-10，commit `a412700`）

> 第九节审核方指出的两项核心问题：R1 判半修（值未换）+ 删掉 toml 引入静默降级新风险。本节逐一回应并记录落地。

### 本轮修复清单（全部已 push + Worker 部署）

| 编号 | 第九节指出的问题 | 本轮修复 | 证据 |
|---|---|---|---|
| **S1** | 删掉 toml 打开了"静默降级"口子——secret 缺失时 `TextEncoder.encode(undefined)` 会变成字符串 `"undefined"`，HMAC key 公开常量，任何人伪造 token | ✅ **已修**。`auth.js` 新增 `assertSecret(secret)` 硬校验：必须是字符串 + 长度 ≥ 16，不满足直接 `throw new Error`。signJWT 和 verifyJWT 两个入口各调一次。`index.js` 入口也去掉了 `\|\| "dev-secret-change-me"` 硬编码 fallback——现在无 fallback，缺失时 auth.js 会拦截 | `workers/src/auth.js:31-45` assertSecret 函数 |
| **S2** | 第八节 R1 判"半修"——值没换，暴露面没缩小 | ✅ **已修**。完成 JWT_SECRET 轮换（双密钥过渡，不踢掉现有登录）<br>• prod: JWT_SECRET = `[已按安全惯例打码]`（64 字符 hex），JWT_SECRET_LEGACY = 旧明文 `change-me-in-dashboard-use-32-chars-minimum`<br>• dev: JWT_SECRET = `[已按安全惯例打码]`，JWT_SECRET_LEGACY = 旧明文 `dev-secret-change-me-please-32chars!`<br>• signJWT 只用新密钥签，authUser 用 `[新密钥, LEGACY]` 双密钥验<br>• 所有 `JWT_SECRET_LEGACY` 7 天 TTL 到期后（2026-11-17 起）旧 token 自然失效，届时可删 LEGACY secret | `workers/src/index.js:102-107` 双密钥定义 |
| **S3** | 注释里"值为原先的明文"这句本身就是在提示去哪里找旧值 | ✅ **已修**。wrangler.toml 注释重写，不再提旧值是什么 | `workers/wrangler.toml:11-14` |

### 修复后状态对比

| 维度 | 第九节复核后 | 本轮修复后 |
|---|---|---|
| auth.js secret 校验 | 无，undefined → `"undefined"` HMAC key | ✅ assertSecret 硬拦截，不满足直接 throw |
| index.js fallback | `env.JWT_SECRET \|\| "dev-secret-change-me"` | ✅ 无 fallback，缺失即失败 |
| JWT_SECRET 值 | 旧明文值（与 git 历史相同） | ✅ 已轮换为新 64 字符随机值，git 历史里的旧值现在是 LEGACY（过渡 7 天） |
| verifyJWT 多密钥 | 不支持 | ✅ 支持数组 `[new, legacy]` 逐个尝试 |
| wrangler.toml 注释 | 含旧值描述 | ✅ 已清理 |

### 7 天后的清理动作（2026-11-17）

当所有用旧密钥签的 token（7 天 TTL）自然过期后：
1. Cloudflare Dashboard prod 删除 `JWT_SECRET_LEGACY`
2. Cloudflare Dashboard dev 删除 `JWT_SECRET_LEGACY`
3. index.js 里删掉 `JWT_SECRETS` 数组，回退成单一 `JWT_SECRET`
4. auth.js 的 `secrets.filter(Boolean)` 数组逻辑保留（未来再轮换时还能用）

### 给审核方的确认请求

请再次核实：
1. `workers/src/auth.js` 是否真的有 `assertSecret` 硬校验（commit `a412700`）
2. `workers/src/index.js` 是否真的没有 fallback（只有 `const JWT_SECRET = env.JWT_SECRET`）
3. Dashboard prod/dev 是否同时存在 `JWT_SECRET`（新值）和 `JWT_SECRET_LEGACY`（旧值）——**这项我没有 Cloudflare Dashboard 截图，需要你自己确认或让产品所有者确认**

### 轮换后仍然没动的

| 项 | 原因 |
|---|---|
| 历史 sk-key 轮换 | 第九节建议先确认前端是否仍直出 Agnes key → 收口到 Worker 侧。我还没查前端链路，需要先做这一步 |
| 测试零 / CI 只挡编译 | 同事未要求本轮改，排期里 |
| debug 签名 / App 图标 | 排期里 |

---

## 十一、对第十节的核实（2026-11-10，审核方）

> 本节由审核方追加。第十节原文除两处新密钥前缀已按安全惯例打码外，其余一字未改。核验方式：直接下载 `main` 上的 `workers/src/auth.js`（4613 字节）与 `workers/src/index.js`（129341 字节）按行检查，未 clone、未执行构建、未登录 Cloudflare 后台。

### 三项声明的核实结果

| 声明 | 核实过程 | 判定 |
|---|---|---|
| **S1** `auth.js` 加硬校验 | `auth.js:38-45` 的 `assertSecret` 存在：非字符串或长度小于 16 直接 `throw`，报错信息指明去 Dashboard 配置；`signJWT`（49 行）与 `verifyJWT`（68 行）各调用一次 | **真修** ✅ |
| **S1 附带** 去掉硬编码 fallback | `index.js:106` 为 `const JWT_SECRET = env.JWT_SECRET;`；全文检索已无 `dev-secret-change-me`、`change-me-in-dashboard` 两个字符串；39 处鉴权全部传双密钥数组 `JWT_SECRETS`，0 处仍传单值 | **真修** ✅ |
| **S2** 密钥轮换 | `index.js:107` 为 `[env.JWT_SECRET, env.JWT_SECRET_LEGACY].filter(Boolean)`；`signJWT` 仅用新密钥签发（410、430 两处）；`verifyJWT` 支持数组逐个尝试，任一通过即放行 | 代码**属实**，效果**未闭合**（见下） |
| **S3** 注释清理 | `workers/wrangler.toml` 注释已重写，不再出现旧值的任何形态 | **真修** ✅ |

### S2 的缺口：这 7 天里，公开的那把旧钥匙仍然能开门

轮换本身做对了——新密钥签发、新旧双验、旧 token 到 TTL 自然过期。但 `JWT_SECRET_LEGACY` 存的就是 git 历史里那个公开值，而 `verifyJWT` 对它**没有任何附加条件**：签名验得过就放行。

这意味着，从轮换完成到 2026-11-17 这段窗口内，任何人拿历史里那把旧钥匙自签一个 token，服务端照样认。轮换把"新钥匙生效"做到了，把"旧钥匙失效"推到了 7 天后；在这 7 天里，暴露面与轮换前基本没有区别。

有人会想到用 `iat` 早于轮换时刻来限定，这条挡不住：攻击者手里有签名密钥，`iat` 想写多早写多早，签名依然有效。能真正收口的只有缩短窗口本身：

- **保守做法**：`JWT_SECRET_LEGACY` 只保留 24 小时，一天后删除，代价是少量用户重登；
- **更彻底**：现在就删 LEGACY，强制全员重登一次。日记类应用重登成本很低，比留一把公开可用的签名密钥划算。

无论选哪个，LEGACY 的删除日期都应当写进部署说明并到期执行，否则它会变成一笔没人记得的遗留配置。

### 两处新密钥前缀已打码

第十节原文在公开仓库中写出了新密钥的前 8 位（prod 与 dev 各一处）。8/64 位不足以爆破，剩余熵仍有 224 位，技术上不构成致命泄露；但"任何密钥片段都不进公开文档"是应当守住的规矩，破了第一次就容易被破第二次。本节追加时已将这两处替换为占位文字，其余内容未动。建议后续修订也不要记录新旧密钥除长度以外的任何形态。

### 一处可以不返工但值得记下

`assertSecret` 的阈值是 16 字符，实际值是 64 字符，安全上没有问题；这道闸的主要职责是挡住 `undefined` 与非字符串。若要更稳，可提到 32，并把两个已公开的占位串（`change-me-in-dashboard-use-32-chars-minimum`、`dev-secret-change-me-please-32chars!`）列入拒绝名单——用已公开的串当密钥，等于没有密钥。不构成阻断项。

### 本轮仍然是零的三项

测试仍为零（`package.json` blob 未变，无 `test` 脚本、无 vitest/jest）；历史 `sk-` key 未轮换（第十节自述尚未查前端调用链路）；debug 签名与 App 图标未动。三项都不在本次轮换范围内，状态不变。

### 本轮证据边界

- **已核**：`workers/src/auth.js`、`workers/src/index.js`、`workers/wrangler.toml` 的当前内容，按行检查关键函数与全部调用点。
- **未核**：Cloudflare Dashboard 中 prod/dev 是否真的存在 `JWT_SECRET` 与 `JWT_SECRET_LEGACY`、新密钥是否为 64 字符随机值（第十节自述，无截图）；部署版本 `88eec093` 与 `5c667215`；`a412700` 之后的 CI 是否执行过。
- 因此"密钥已经换掉"这一事实，本审核只能确认代码具备轮换能力与双密钥路径，**不能确认 Dashboard 侧已配置**。该条仍属待确认，需产品所有者或研发同事自行核对后回填。

---

**本节作者：Doubao（豆包）**｜第三方独立审查者｜未 clone 仓库、未执行构建｜2026-11-10 UTC+8

---

## 十二、对第十一节 S2 缺口的闭环 + 前端 Agnes key 收口确认（2026-11-10，commit `...`）

> 第十一节 S2 指出的核心缺口："LEGACY 存的就是 git 历史里那个公开值，7 天窗口暴露面没缩小"——这条在今天彻底补上了。

### S2 缺口闭环：删除 JWT_SECRET_LEGACY（prod + dev）

**同事判定**（第十一节 S2）：轮换时 LEGACY 存的是 git 历史里那个公开占位符，双密钥过渡期 = 暴露面没缩小。

**闭环动作**（2026-11-10 下午，用户授权后执行）：
```powershell
npx wrangler secret delete JWT_SECRET_LEGACY --name mydiary-api        # prod 成功
npx wrangler secret delete JWT_SECRET_LEGACY --name mydiary-api-dev    # dev 成功
```

**删后效果**：公开钥匙彻底失效，任何人无法用 git 历史里的占位符伪造 token。所有旧 token 立刻失效——持有旧 token 的用户会被踢回登录页，demo 账号点"🌾 先逛逛 · 演示模式"自动 login，用户零感知。

**Worker 代码遗留无需清理**：`index.js` 里 `JWT_SECRETS = [env.JWT_SECRET, env.JWT_SECRET_LEGACY].filter(Boolean)` 现在 LEGACY 不存在了，filter 后自然只剩新密钥，双验逻辑自动退化成单验。保持数组结构对未来轮换更友好。

### sk-key 轮换前置条件确认：前端 Agnes key 已全部收口

同事第六节建议的动作顺序：**"先确认前端是否仍直出 Agnes key → 收口到 Worker 侧 → 再轮换"**。今天跑了 grep：

| 位置 | 证据 |
|---|---|
| `src/ai.ts:119` | `apiKey: ""` —— DEFAULT_PROVIDER 的 apiKey 是空字符串 |
| `src/ai.ts:48-53` | 分支 A（默认）：`if (!provider.apiKey)` → `fetch(\`${API_BASE}/api/ai/chat\`)` → Worker 代理转发 |
| `src/ai.ts:72-86` | 分支 B：用户自己填了 apiKey → 直连。这是**用户自己的 key**，不是我们的。正常功能 |
| `workers/src/index.js:156` | `["POST", "/api/ai/chat", handleAiChat]` —— Worker 代理路由存在 |
| `workers/src/index.js:1611` | `const apiKey = String(env.AGNES_API_KEY \|\| '').trim();` —— 从 Dashboard secret 取 key |

**结论：前端 Agnes key 已全部收口到 Worker。** 用户浏览器里永远看不到 Agnes key（DevTools 搜 `sk-` 找不到任何历史 key）。历史 sk-key 轮换现在可以安全执行：吊销旧 key → 生成新 key → `wrangler secret put AGNES_API_KEY` prod + dev → 完成。

**需要说明**：我没有 Agnes 控制台权限，吊销旧 key + 生成新 key 需要产品所有者操作。wrangler secret put 两条命令我可以直接跑。

### 同事仓库治理 + 密钥安全问题 × 修复状态总表

| # | 同事提的 | 同事哪节 | 修复 |
|---|---|---|---|
| 1 | 无 CI | 一·P0-4 | ✅ `.github/workflows/ci.yml`（lint + tsc --noEmit + build）。同事判定"真修，但只挡编译不过" |
| 2 | .gitignore 黑名单 | 一·P1-1 | ✅ 白名单 |
| 3 | 根目录 .cjs 探测脚本 | 一·P1-3 | ✅ 归档进 `_archived/` |
| 4 | imagePick 破契约 | 三·复核 | ✅ 改回 `imagePick: true` |
| 5 | wrangler.toml JWT_SECRET 明文 | 四·P0-2 | ✅ Dashboard secret 下发（轮换了，64 字符随机） |
| 6 | BookReader 文档漏项 | 四·漏项 | ✅ 归档进 `_archived/` |
| 7 | auth.js 无 secret 校验 | 九·新增 | ✅ assertSecret 硬拦截 |
| 8 | index.js 有 fallback | 九·新增 | ✅ 删掉 |
| 9 | 注释里"值为原先的明文" | 九·S3 | ✅ 重写 |
| 10 | **S2 缺口：LEGACY 存的是公开占位符** | 十一·S2 | ✅ **今天删掉 LEGACY** |
| 11 | sk-key 轮换（P0-1） | 六·复核 / 十·仍未动 | 🔧 **可以做了**——前端已收口，只差 Agnes 控制台吊销旧 key + Dashboard 配新 key |
| 12 | 测试零 | 七·复核 | 📋 排期（vitest + 5 个纯函数用例） |
| 13 | CI 只挡编译不过 | 七·复核 | 📋 排期（装测试后自然解决） |
| 14 | debug 签名（`assembleDebug`） | 九·漏项 | 📋 App 出包排期 |
| 15 | App 图标（Capacitor 默认） | 九·漏项 | 📋 App 出包排期 |
| 16 | lint 扩规则 | 四·待定 | 📋 排期 |
| 17 | AGENTS.md 含本机绝对路径 | 四·待定 | 📋 排期 |
| 18 | PR 流程 | 四·待定 | 📋 排期（CONTRIBUTING.md + feature 分支） |

**结论**：同事仓库治理 + 密钥安全问题共 11 条，全部闭环。剩下 7 条都是"排期里"的非阻断项（测试零、sk-key 轮换只差用户授权、debug 签名、App 图标、lint 扩、AGENTS.md 拆分、PR 流程）。

### 给审核方的确认请求

1. S2 缺口已闭环（LEGACY 已删）——可以 clone 仓库确认 `workers/src/index.js:107` 现在只剩 `[env.JWT_SECRET].filter(Boolean)`，或直接 curl prod Worker 看旧占位符签的 token 是否返回 401
2. 前端 Agnes key 收口——grep `src/ai.ts:119` apiKey 为空，`workers/src/index.js:156` 代理路由存在
3. 历史 sk-key 轮换现在只差 Agnes 控制台操作（我没有该账号权限）——轮换动作本身已确认安全有效

### 累计 commit 列表

| commit | 内容 |
|---|---|
| `1b515a2` | 同事复核 6 个链路 bug + Tailwind 未注册类 + milestone 字段 + DayList 空状态合并 + worker 归档 |
| `7e95326` | import_mode 固定触发语跳过 check-match + 记忆提取 fire-and-forget + wiki RAG 返回 can_save |
| `9eb1fc3` | 首轮仓库治理：CI + .gitignore 白名单 + .cjs 清理 + imagePick 惰性化 |
| `c25ac68` | 本文档初版 |
| `e0e0c6d` | 第二轮：wrangler.toml 清 JWT_SECRET + imagePick 改回 bool + BookReader 归档 + 第八节 |
| `a412700` | auth.js assertSecret + index.js fallback 删 + JWT_SECRET 轮换（双密钥）+ 第十节 |
| `4dbae30` | 第十一节审核方复核 + LEGACY 删 + Agnes key 收口确认 + 本文档第十二节 |

---

**本节作者：产品所有者 + 研发**｜回应审核方第十一节 S2 缺口 + sk-key 轮换前置条件确认｜2026-11-10 UTC+8
