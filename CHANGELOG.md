# MyDiary 版本更新记录

## v0.3.1 — 2026-09-18

### 🐛 Bug 修复

- **📊 记账柱图方向反了** — FinancePage 柱图 `justify-start` 改成 `justify-end`，新的日期从右边往左边生长（符合时间直觉）；X 轴显示全部日期不再只取偶数天
- **📊 柱图 X 轴只显示偶数** — 修复 chartWidth 宽度计算，现在所有日期都能看到
- **📈 每日一句话总结不到真实内容** — summarizeDay 之前只看 text block，记账模板全是 finance_item 没有 text，导致 AI 每次都兜底；现在加上 finance_item 收支流水提取
- **📖 历史抽屉 0 条** — 后端按登录 uid 过滤 daily_summaries，手工塞数据用错了 uid；前端同时忽略后端 save 返回的最终 id（`{ id: diaryId }`），导致 title 语义合并后前端本地还是旧 uid → 初始化合并时 id 不同无法去重

### 🛡️ 架构加固：三道防线彻底终结重复日记

之前重复日记的根因链：前端新建任何模板都 `uid()` 生成新 id → 后端按 id 查 → 查不到 → INSERT 新行（migration 0005 已删唯一约束）→ 每次保存一篇等于一次 INSERT。**三道防线堵死链路**：

1. **后端写时** — `date + template_id + title` 相同（finance/milestone/plan 模板）→ 按语义键 UPDATE 不 INSERT
2. **前端 save 后** — 处理后端返回的最终 id，如果后端用了不同 id → 把本地旧 id 纠正成新 id
3. **前端 init 合并时** — `dedupeDiaries` 加第二层 title 语义去重（只对 finance/milestone/plan 模板），localStorage 旧 uid + 云端同标题新 uid → 合并到 updatedAt 最新的那条

### 🛡️ 编辑器空模板拦截

新建 finance 模板后改了标题没填收支就保存 → 默认标题 + 所有 finance_item 全是 0 值 → 弹窗拦住"至少记一笔再保存"，不让垃圾数据进 D1

### 📦 本次改动文件

| 文件 | 改动 |
|------|------|
| workers/src/index.js | handleSaveDiary 加 title 语义合并（date+template+title → UPDATE） |
| src/App.tsx | dedupeDiaries 加双层去重（id + title 语义）；handleUpsert 处理后端返回 id 纠正本地 state |
| src/components/FinancePage.tsx | 柱图 justify-end + X 轴全日期显示 |
| src/ai.ts | summarizeDay 加 finance_item 流水提取 |
| src/components/EditorPage.tsx | 保存前空模板拦截 |
| CHANGELOG.md | v0.3.1 版本记录 |
| package.json / vite.config.ts | 版本 0.3.0 → 0.3.1 |

---

## v0.3.0 — 2026-09-17

### 🎉 新功能

- **🎯 计划模块（原每日计划升级）** — 从「每日计划」模板扩展成完整的计划系统，不再局限于当天
  - 任何未来日期的计划都能写成日记，自动识别目标日期、倒计时、到期状态
  - 顶部导航栏 🎯 入口 + 完整 PlanPage/PlanLibrary 组件（和纪念日/时间胶囊并列）
  - 后端 plans 子表双写，和日记关联但有独立的状态管理
- **📖 每日一句话入库 + 历史查看** — 首页 StreakBadge 的一句话不再只是临时缓存
  - 每天自动提炼的一句话存 D1（`daily_summaries` 表），跨设备可见
  - 点「📖 历史」弹出抽屉，按日期倒序展示所有历史
  - 空状态引导：刚注册时显示"这里会出现什么"完整说明
  - 四种场景全覆盖：有+有、有+没、没+有、都没有 → 不同温暖文案
- **📅 纪念日独立页面** — 从 Profile「我的」移除，统一归首页顶部导航 🎈 入口
- **⚙️ 设置移到右上角** — 齿轮按钮弹出菜单（字体切换 / 智能服务 / 反馈 / 关于），更符合移动端常规操作

### 🐛 Bug 修复

- **每日一句话永远走兜底** — `callChatCompletion` 写死 `response_format: json_object`，但 summarizeDay 要纯文本 → 强制返回 JSON → 每次命中错误兜底。给 callChatCompletion 加 `responseFormat` 参数，summarizeDay 用 `"text"`，其他 skill 保持 `"json_object"`
- **总结缓存 key bump v2** — 之前坏的兜底缓存可能存过错误内容，bump key 强制清掉

### 🧹 交互改进

- **4 个列表页空状态统一** — 标签🏷️ / 纪念日🎈 / 计划🎯 / 时间胶囊🫧
  - 顶部常驻说明文字（不管有没有内容），让用户始终知道"这页是干嘛的"
  - 空状态用 emoji + 主文案 + py-12 居中布局，以时间胶囊为参照
  - 计划的引导文案改成正面例子（"10月20号和朋友去看海"）
- **顶部导航栏按钮** — 🏷️ 🎈 🎯 🫧 🗑️ 一键直达，不再 toggle 选中
- **🎤 语音识别断线自动重连** — Chrome 原生 SpeechRecognition 会随机断开（网络抖动、切后台），之前断了就停；现在检测到非用户主动停止就自动重启，加防抖 timer 防止无限循环；识别准确率和稳定性显著提升

### 📦 本次改动文件

| 文件 | 改动 |
|------|------|
| workers/migrations/0006_plans.sql | 新增 plans 表 |
| workers/migrations/0007_daily_summaries.sql | 新增 daily_summaries 表 |
| workers/src/index.js | 加 4 条 /api/summaries + 4 条 /api/plans 路由 |
| src/api.ts | Plan / DailySummary 类型 + CRUD + saveSummary / listSummaries |
| src/ai.ts | callChatCompletion 加 responseFormat 参数；summarizeDay text 模式 + 自动存库 |
| src/components/StreakBadge.tsx | 加 📖 历史抽屉 + 四种空状态文案 |
| src/components/CalendarPage.tsx | 顶部导航 🎈 🎯 等按钮（直接 nav 跳路由） |
| src/components/MilestoneLibrary.tsx | 空状态 py-16 + 说明文字常驻 |
| src/components/PlanLibrary.tsx | 新组件 + 空状态 + 常驻说明 |
| src/components/PlanPage.tsx | 新独立页面 |
| src/components/MilestonesPage.tsx | 新独立页面（从 Profile 拆出来） |
| src/components/CapsulePage.tsx | 说明文字常驻顶部 |
| src/components/TagsPage.tsx | 说明文字常驻顶部 |
| src/components/ProfilePage.tsx | 移除纪念日 tab |
| src/types.ts | Diary 加 planInfo 字段 |
| CHANGELOG.md | v0.3.0 版本记录 |
| package.json / vite.config.ts | 版本 0.2.1 → 0.3.0 |

---

## v0.2.1 — 2026-09-16

### 🎉 新功能

- **💾 日记 Block 软删除** — 删除后划掉显示 + 恢复按钮，二次确认后才真正删除（修了很久的核心交互）
- **✍️ 继续书写** — 编辑器底部直接写新内容，不用点按钮新建 block
- **📚 模板/信纸共享系统** — 共享给所有人、带作者信息
- **🖋️ 字体自定义** — 「我的 → 设置 → 字体样式」三种可选
  - ✍️ 全手写（推荐）：中文钢笔 + 英文手写
  - 🖋️ 钢笔中文：中文手写、英文印刷
  - 📝 系统默认：简洁印刷体
  - 设置自动保存到 localStorage，下次打开自动恢复
  - 全局生效：标题、按钮、日历、编辑器文字全部跟着变
- **🧪 Dev Pages 测试环境** — mydiary-web-dev.pages.dev，永久不变，前端 Pages Functions 按 host 自动连 dev/prod Worker

### 🐛 Bug 修复

- **删除后恢复功能** — 软删除后能恢复的核心交互 bug
- **iOS Safari 中文字体不手写** — WebKit 的 font-display: swap + 5.6MB 大字体，下载完后已渲染文字不自动重绘。通过 document.fonts.ready + -webkit-text-stroke hack 强制重排
- **Tailwind preflight 覆盖手写字体** — Tailwind 给 html 注入了 PingFang SC，之前只给 body 设手写体导致被覆盖。现在 html 和 body 同时设
- **Kalam 放字体栈第一位** — 之前顺序反了导致英文数字回退到印刷楷体

### 📚 运维文档

- **DEPLOY.md 重写** — 完整的双环境（dev/prod Pages + Worker + D1）架构、部署流程、回滚方案、命令速查

### 📦 本次改动文件

| 文件 | 改动 |
|------|------|
| src/components/ProfilePage.tsx | 字体设置 + FontPicker Modal + changelog 弹窗 |
| src/components/EditorPage.tsx | Block 软删除 + 底部续写 textarea |
| src/index.css | Tailwind preflight 覆盖 + iOS 重绘 hack |
| src/main.tsx | 启动时恢复 html/body[data-font] + iOS 重绘触发 |
| functions/api/\[\[path\]\].js | Pages Functions 按 host 智能路由 |
| workers/wrangler.toml | dev/prod 双环境配置 |
| DEPLOY.md | 完整运维手册（全新重写）|
| CHANGELOG.md | v0.2.1 版本记录 |
| package.json / vite.config.ts | 版本 0.2.0 → 0.2.1 |

---

## v0.2.0 — 2026-09-16

### 🎉 新功能

- **📚 模板共享系统** — 创建自定义模板、一键共享给所有人
  - 👤 我的模板库：创建 / 编辑 / 删除 / 共享
  - 🌐 共享模板：在日记模板 Drawer 里看别人发布的模板
  - 模板 Builder：选组件组合（标题/待办/记账/摘抄...）+ 业务化描述
- **🎨 信纸共享系统** — 上传自己的信纸、一键共享
  - 👤 我的信纸库：上传 / 删除 / 共享
  - 🌐 共享信纸：在日记信纸 Drawer 里看别人的信纸
- **📝 反馈与建议** — 「我的 → 关于 → 反馈」直接提交到 D1
- **👤 全新「我的」页面** — 用户卡片 + 写作统计 + 模板库 + 信纸库 + 设置 + 关于

### 🔧 交互改进

- 模板/信纸 Drawer 选中色统一 **紫色 (violet)**
- 模板切换：有内容时弹"切换确认"（单击选中 → 二次确认）
- 删掉 Drawer 里的编辑/删除按钮 → 统一去「我的」页面管理
- 删掉信纸 Drawer 里的「自定义/从相册选」→ 统一去「我的 → 信纸库」上传

### 🏗️ 架构

- **双环境隔离**：dev Pages + prod Pages 各自代理到对应 Worker（不翻墙可测）
- **Workers + D1**：后端全部 Cloudflare 无服务器
- **Pages Functions**：同域代理 /api/* 请求，绕开 workers.dev 拦截

---

## v0.1.0 — 2026-09-10

### 基础框架

- 邮箱注册/登录 + JWT 鉴权
- 日记 CRUD + localStorage ↔ D1 双向同步
- 10 种 Block 组件：text / heading / divider / checkbox / number / finance_item / image / audio / book / quote
- 8 个官方模板：日记 / 记账 / 读书 / 旅行 / 运动 / 每日计划 / 感恩日记 / 健康记录
- 底部 Tab Bar：我的 | 语音快记 | 写日记
