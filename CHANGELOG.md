# MyDiary 版本更新记录

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
- 底部 Tab Bar：我的 | AI速记 | 写日记
