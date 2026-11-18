# AI 助手工作约定（MyDiary · 单仓三产物）

> 📍 适用范围：GitHub `mcartney-liu/my-diary` 仓库根目录
>
> ✅ **本仓库是唯一的生产代码库**：Web（`app.callmydiary.online`）、Worker API、Android 套壳全在这一份里。
>
> ❌ 不存在独立的「Web 生产副本」或「App 专用副本」。历史文档里的这两个说法已作废
> （2026-11-18 订正，原写法会导致 AI 助手去改一个不存在的目录，或误以为改 Web 不影响线上）。
>
> 更细的协作规矩见 **`docs/APP-SYNC-RULES.md`**（人看的版本，这里是给 AI 看的精简版）

---

## 仓库结构（一份代码，三个产物）

| 产物 | 代码位置 | 部署方式 |
|---|---|---|
| **Web** | `src/` → `vite build` → `dist/` | push 到 `main` → Cloudflare Pages **自动构建上线** |
| **Worker API** | `workers/src/index.js`、`workers/src/wiki.js` | Cloudflare Worker + D1（`workers/wrangler.toml`） |
| **Android 套壳** | `android/`、`capacitor.config.ts` | `npm run cap:apk` 本地出包，装到设备才生效 |

⚠️ **push 到 `main` 就等于上线**。没有"先合到某个副本、再单独发布"这一步，改动默认分支前必须想清楚影响面。

---

## 🔴 硬性约束（违反即错）

### 1. 平台差异只写 `src/platform.ts`
- ✅ 平台判断、`capabilities`、token key 判定 → 写 `src/platform.ts`
- ❌ 业务组件（`src/components/**`、`src/App.tsx` 等）里**一律不许**写 `if (isApp)` / `capacitor://` 判断
- 业务组件通过 `platform.capabilities.xxx` 问能力

### 2. commit / push / tag 必须翔哥拍板
**严禁自主执行**。包括看似安全的本地 commit（除翔哥明确说"commit"）。

### 3. 动手前必须 `git status`
**仓库里有同事同时在改代码**。改任何文件前先确认是否被外部改动：
```bash
git status --short
git diff <目标文件>
```
发现非我方改动 → **先问，不覆盖**。

### 4. 不动同事的调试代码
`src/App.tsx` 里有同事加的 `console.info` / `console.warn` 调试语句，**保留**，不要清理。

### 5. 改动要分三处评估影响
同一个改动可能命中 Web / Worker / App 三个产物之一或多个。改完在提交信息里写清：
"Web 侧怎么生效、Worker 要不要发布、App 要不要重新出包"。

---

## 环境（出包机器的本机安装，**不在仓库内**）

| 组件 | 位置 |
|---|---|
| JDK 21.0.9 | `D:\Android\jdk-21.0.9+10`（**必须用 21**，Capacitor 8 要求） |
| JDK 17.0.20.1（残留，不用） | `D:\Android\jdk-17.0.20.1+1`（本机有残留安装，编译**不要用**） |
| Android Studio | `D:\Android\Android Studio`（Rabbit 1 \| 2026.2.1） |
| Android SDK | `D:\Android\Sdk`（platform 36/37、build-tools 36+37、platform-tools 37.0.1） |
| Gradle 缓存 | `D:\Android\.gradle`（`GRADLE_USER_HOME` 已设） |

换一台机器出包需自行准备以上环境；仓库里不含任何 SDK 或 JDK。

---

## 出包命令（Windows，**在仓库根目录**执行）

```bash
npm run cap:apk
```

等价于依次执行：
```bash
npm run build:app      # vite build --mode app → 读 .env.app，注入 VITE_API_BASE
npx cap sync android   # 同步 dist 到原生工程（已废弃 cap copy，统一用 cap sync）
cd android && gradlew.bat assembleDebug
```

需要手动拆开跑时：
```bash
export JAVA_HOME='D:\Android\jdk-21.0.9+10'
export GRADLE_USER_HOME='D:\Android\.gradle'
export ANDROID_HOME='D:\Android\Sdk'
export ANDROID_SDK_ROOT='D:\Android\Sdk'
cd android && ./gradlew.bat assembleDebug --no-daemon
```
（`export` 写法的坑见下方"硬特性 0"）

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔧 本机环境的硬特性（踩过的坑）

### 0. Windows 下不要用 `export`，也不要加双引号
`export` 是 bash 语法，PowerShell 里无效；且 **路径必须单引号**——
双引号会吞反斜杠，导致 Gradle 找不到 `java`。
PowerShell 正确写法：
```powershell
$env:JAVA_HOME='D:\Android\jdk-21.0.9+10'
$env:GRADLE_USER_HOME='D:\Android\.gradle'
```
最省事的做法是直接用 `npm run cap:apk`，脚本里已处理好。

### 1. `npm install` 不能并行
同一 `node_modules` 跑两个 npm 进程会互相抢文件 → esbuild 平台二进制装漏（`EBUSY` / `could not be found`）。
**单进程重跑 `npm install` 可解决。**

### 2. `googlevideo.com` 被代理拦
Android Studio 安装包、JDK 等走该 CDN 的下载**全部失败**（`502 CONNECT tunnel failed`）。
- ✅ JDK 走 `aka.ms`（微软 CDN）→ 能下
- ❌ Android Studio 走 googlevideo → 下不了，**需人工用浏览器下载**

### 3. safe-delete 批量守卫
删除超过 50 个文件会被拦（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。
**绕过方式**：`find <dir> -type f -delete` 逐个删。
影响：`npx cap add android` 会因此漏生成 `capacitor.settings.gradle` 等文件 → **构建失败，需删除重生成**。

### 4. Maven 镜像
`dl.google.com` 解析不稳定，已在 `build.gradle` / `settings.gradle` 配**腾讯云镜像**。
⚠️ **阿里云未同步 androidx，会 404，别用。**
⚠️ `pluginManagement {}` 必须是 `settings.gradle` 第一句。

### 5. `git push` 需要单独配代理
本机 `git push` 会报 `curl 28 Recv failure: Connection was reset`（pull 正常、push 的 RPC 上传被掐）。
系统代理开着也没用——**git 不读系统代理**，需显式配置：
```bash
git config http.proxy  http://127.0.0.1:10809
git config https.proxy http://127.0.0.1:10809
```

---

## Web 推送前必查清单

```bash
# ① TypeScript 零错误
npx tsc -b --noEmit

# ② CI 四项（GitHub Actions 会跑同一套）
npm run lint && npx tsc -b --noEmit && npm run build
```

---

## 出包前必查清单

```bash
# ① TypeScript 零错误
npx tsc -b --noEmit

# ② 生产 API 地址已注入（App 包：index-*.js 里必须 ≥1，dev 域名必须 0）
grep -c "app.callmydiary.online" dist/assets/index-*.js
grep -c "mydiary-api-dev" dist/assets/index-*.js

# ③ APK 时间戳已更新（防「编译成功但装旧代码」）
ls -la android/app/build/outputs/apk/debug/app-debug.apk

# ④ 工作区无意外改动
git status --short   # 只应有你本次的改动
```

⚠️ **已知坑**：Gradle 的 `packageDebug` 不跟踪 `assets/` 目录，会判 `UP-TO-DATE` → APK 还是旧代码。
已加钩子修复（日志会打 `[MyDiary] 检测到 web 资源更新，强制刷新 assets 中间产物`），但**仍要查时间戳**。

---

## 同步流程（Web 改完 → 出新 APK）

```
翔哥：Web 改完 → push main（Cloudflare 自动上线）→ 告知改了哪些功能
出包方：git pull origin main
      → 若有平台适配，只改 platform.ts / 套壳文件
      → npm run cap:apk
      → 交翔哥验证
```

**实测耗时**：1.5-3.5 分钟（增量）。

**冲突高发文件**（改之前先 pull）：`src/App.tsx`、`src/api.ts`、`src/components/EditorPage.tsx`

**最容易漏的一步**：Web 上线 ≠ App 生效。App 必须重新出包，否则设备上还是旧 dist。

---

## 待办清单（截至 2026-11-18，逐条需复核）

### 功能 / 发布
- ⬜ **语音快记在 App 报"拒绝录音"** — `VoiceQuickEntry.tsx` 缺能力检测（`EditorPage`/`ProfilePage` 已有）。云端有 `/api/transcribe`（Workers AI Whisper 模型），前端发 POST 带音频 Blob 即可。（需复核实测现状）
- ⬜ **App 图标** — 仍是 Capacitor 默认蓝色 `</>`，3 版设计稿已出（钢笔日记本 / 麦穗 / 抽象笔画），待翔哥选。
- ⬜ **正式签名** — 现为 debug 签名，无法上架 / 用户无法更新。配 keystore 后需长期保管（丢了无法更新 App）。
- ⬜ **`webContentsDebuggingEnabled` 仍是 true** — `capacitor.config.ts` 里为调试图省事关着方便，正式包应关闭。

### 性能（见 CHANGELOG v0.5.16 记录）
- ⬜ **零代码分割** — 构建产物是单个 997KB JS（gzip 287KB），首屏把 `EditorPage`（158KB 源码）/ `KnowledgeBase`（110KB）/ `ProfilePage`（96KB）/ `AiChatView`（54KB）一起解析。建议路由级 `React.lazy` + `Suspense`。
- ⬜ **切前台重复拉全库** — `platform.onAppResume` 同时监听 `visibilitychange` 和 `window.focus` 且未做幂等，`App.tsx` 的 `refreshFromCloud` 直接挂上去；每次触发都拉 `limit=365` 的完整日记（含全部 blocks）+ 全量 `JSON.stringify` 写 localStorage。
- ⬜ **列表接口返回全量 blocks** — `listDiaries` 不区分"目录"和"正文"，建议列表只返回摘要/首段，进编辑器再按 id 拉单篇。
- ⬜ **glass 主题在移动端开销大** — `index.css` 有 58 处 `backdrop-filter`（blur 12~20px）以及 `background-attachment: fixed`，Android 中低端 WebView 滚动容易掉帧。

### 文档
- ⬜ **残留"副本"措辞** — `.env.app`、`capacitor.config.ts` 的注释里仍写着"Web 副本 / App 副本"，与本文件口径不一致，待统一。
- ⬜ **C 盘清理（与本仓库无关）** — 某台出包机 `C:\Users\haizhi\AppData\Local\Android` 剩 23628 个小文件删不动，需人工用资源管理器处理。
