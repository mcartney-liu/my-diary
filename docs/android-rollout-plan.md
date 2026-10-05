# MyDiary 安卓 App 落地方案

> 📅 2026-10-05 ｜ 状态：**方案文档，待翔哥审阅拍板**
> 配套：`android-app-guide.md`（实操步骤）｜ `android-capsule-snapshot.md`（已完成的套壳成果清单）

---

## 摘要（一页看完）

套壳代码**已经全部做完并验证通过**（不是概念阶段）。剩下的只有「出 APK」这一步，卡在**本机没装 Java/Android SDK，且 C 盘只剩 8.8GB**。

本文档回答四个问题：
1. 现在到底做到什么程度了？
2. APK 会有多大、为什么？怎么压？
3. 上架应用市场要办什么手续？
4. 哪些坑会咬人（WebView 录音、离线、真机调试）？

**核心结论**：技术上没有拦路虎，纯工程执行。难点在「环境准备」和「上架合规」，不在代码。

---

## 一、当前进度：代码 100% 完成，卡在环境

### 已完成并实测通过 ✅

| 项 | 验证方式 | 结果 |
|---|---|---|
| Capacitor 8.5.2 依赖安装 | `npm install` | ✅ 87 包 |
| Android 原生工程生成 | `npx cap add android` | ✅ minSdk 24 / target 36 |
| 录音/相机权限声明 | 读 AndroidManifest.xml | ✅ RECORD_AUDIO + CAMERA + 媒体读取 |
| 前端生产构建 | `npm run build` | ✅ 2168 模块，25 秒 |
| 资源同步进 APK 目录 | `npx cap sync android` | ✅ 13MB 已注入 |
| **生产 API 地址注入** | grep 产物 | ✅ 只含 `app.callmydiary.online`，无 dev 地址 |
| **跨域可行性** | curl 实测生产站 | ✅ 返回 `Access-Control-Allow-Origin: *` |
| WebView 资源完整性 | 检查 assets 目录 | ✅ 字体/头像/信纸全部打进包 |

**业务代码零改动** —— `src/` 下 40+ 组件、7 个后端 Worker、20 个 D1 migration，一个字节没改。

### 未完成 ❌

| 项 | 卡在哪 | 谁能解 |
|---|---|---|
| **APK 产物** | 本机无 Java、无 Android SDK | 需装环境（下方第三节） |
| **磁盘空间** | C 盘剩 8.8GB，需 10-15GB | 需腾空间 |
| **应用图标** | 仍是 Capacitor 默认图标 | 需生成（可用 `public/favicon.svg`） |
| **上架** | 未启动 | 需软著/备案/签名 |

---

## 二、APK 体积：真相是「11MB 都是图片和字体」

这是本次分析最有价值的发现，纠正了我最初的估算。

### 实测数据（`dist/` 共 13MB）

| 组成 | 体积 | 占比 | 性质 |
|---|---|---|---|
| `fonts/`（马善政 + Kalam 手写体） | **6.0 MB** | 46% | 2 个 TTF 字体 |
| `avatars/`（3D 头像素材） | **3.6 MB** | 28% | 图片 |
| `papers/`（信纸底纹） | **2.1 MB** | 16% | 图片 |
| `assets/`（真正的 JS+CSS） | **0.9 MB** | 7% | 代码 |
| 其余（favicon/index/icons） | <0.1 MB | ~1% | — |

**主包构成**：`index.js` 873KB（gzip 后 254KB）+ `index.css` 56KB。

### 结论与优化选项

> **代码只占 7%。** 所谓"873KB 主包偏大"其实不是问题，App 场景下 873KB 完全可接受。真正占地方的是字体和图片。

| 优化项 | 省下 | 代价 | 建议 |
|---|---|---|---|
| 字体改首启后下载（CDN） | **-6.0 MB** | 首次启动文字短暂非手写体；断网首次看不了手写体 | ⭐ 值得做，但**不急**，16-25MB 完全可用 |
| avatars/papers 改 CDN 懒加载 | **-5.7 MB** | 需要配套 CDN 存储（你有 Cloudflare，可放 R2） | ⭐ 值得做，同上不急 |
| JS 代码分割 | -0.3 MB | 收益极小 | ❌ 不做，收益不成比例 |
| **照现状直接出包** | — | — | ✅ **推荐先这样**，能跑就行 |

**APK 预估**：assets 13MB + Android 壳/原生库约 3-12MB（Debug 包更大）→ **约 16-25MB**。

**一句话建议**：先别优化，跑通第一版。等你真觉得包大影响分发（应用市场有 100MB 上限，你远没到），再动。

---

## 三、环境准备（当前唯一硬阻塞）

### 阻塞原因

实测：`java: command not found`、无 Android SDK 目录、`adb` 不在 PATH、**C 盘仅剩 8.8GB（已用 94%）**。

Android Studio + SDK 完整装需 **10-15GB**，8.8GB 装不下，会中途失败。

### 需要装什么

| # | 组件 | 版本 | 空间 | 谁装 | 说明 |
|---|---|---|---|---|---|
| 1 | **腾出磁盘空间** | ≥15GB | — | 翔哥 | ⚠️ 硬阻塞，必须先做 |
| 2 | JDK | 17 或 21 | ~300MB | 小梦可代劳 | `winget install Microsoft.OpenJDK.17` |
| 3 | Android Studio | 最新稳定版 | ~4GB | 翔哥（图形界面） | 需点确认，我代不了 |
| 4 | SDK Platform 36 | — | ~1GB | Android Studio 内装 | Build-Tools、Platform-Tools 同理 |

### 装完后的流程（一条命令）

```bash
npm run cap:apk
# 产物：android/app/build/outputs/apk/debug/app-debug.apk

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 关于磁盘空间的建议

腾空间优先级（**你决定，我只提供信息**）：
1. 旧 `node_modules`（本项目 227 包 + mydiary-fresh/ -video/ 各 8k+ 文件）
2. 各类 AI 工具的 `*-updater` 目录
3. Windows 各类缓存（Edge/Chrome/pip/npm）
4. 老旧项目备份

> ⚠️ 提醒：按你机器的历史情况，**命令行删文件会被系统级拦截**（safe-delete 垫片强制重定向回收站，而本机回收站功能异常 → 删除必失败）。实际清理可能需要你在资源管理器里手动操作，或把大目录**移到 D 盘**（移动比删除可行）。

---

## 四、WebView 特有的坑（四个，已有两个天然规避）

### 坑 1：录音格式 ✅ 已规避
- **风险**：`MediaRecorder` 在 Android WebView 输出的格式与 iOS Safari 不同（Android 通常 `audio/webm;codecs=opus`），云端 Whisper 若只支持 mp4 会解析失败。
- **现状**：`EditorPage.tsx:1203` 已经做了格式协商 —— 依次尝试 `audio/mp4` → `audio/webm;codecs=opus` → `audio/webm`，自动降级。
- **结论**：**已处理**，真机验证时确认录音能存下即可。

### 坑 2：本地 Whisper 不可用 ✅ 已规避
- **风险**：`transcribe-server.py` 跑在你 PC 的 8080，手机 App 连不到 → 语音转写全失败。
- **现状**：`api.ts` 的 `transcribeAudio()` 已有 fallback 逻辑（先试本地 `/api/transcribe` → 失败则走云端 `${API_BASE}/api/transcribe`）。
- **结论**：**自动降级到云端**，无需改代码。但真机验证时要注意观察云端转写效果和延迟。

### 坑 3：跨域 ✅ 已验证
- **风险**：WebView 源是 `capacitor://localhost`，请求 `https://app.callmydiary.online` 属跨域，被 CORS 拦则全站 API 挂掉。
- **验证**：curl 实测生产站返回 `Access-Control-Allow-Origin: *`。
- **现状**：`capacitor.config.ts` 的 `allowNavigation` 白名单已含生产域名。

### 坑 4 ⚠️ 需注意：API_BASE 曾经会全 404（已解决，但必须知道）
- **风险**：`api.ts` 在 `import.meta.env.DEV === false` 时 `API_BASE` 变空串 → 相对路径打到 `capacitor://localhost` → **每个请求 404，App 变成废壳**。
- **解法**：新增 `.env.production` 注入 `VITE_API_BASE=https://app.callmydiary.online`。
- **验证**：已 grep 产物确认只含生产地址。
- ⚠️ **教训**：将来若改 vite 配置或换构建方式，**必须确认这个变量还在**，否则 App 静默失效。

### 离线能力现状
- 项目**无 Service Worker**（`public/` 下无 `sw.js`/`manifest.json`）。
- 但 App 的离线能力**不依赖 SW** —— 所有 Web 资源已打包进 APK，**断网可正常打开、可写本地日记**（`App.tsx` 的 `localStorage` + 云端合并逻辑原样保留）。
- 联网后自动同步。这是**套壳相比 PWA 的天然优势**。

---

## 五、上架应用市场（如果要走这一步）

**先说结论**：自用装机不需要任何手续（Debug APK 直接装）。**要上架就要办以下几件**。

| 事项 | 周期 | 说明 |
|---|---|---|
| **软件著作权登记** | 30-60 工作日 | 最耗时；国家版权局免费但流程严。可找代办加急 |
| **ICP 备案/公安备案** | 2-4 周 | App 也要备案（工信部+公安网安） |
| **隐私合规** | 1-2 周 | 必须有《隐私政策》+《用户协议》页；说明日记内容属个人隐私数据、是否上传服务器、如何删除 |
| **应用市场审核** | 各家不同 | 华为/小米/OPPO/vivo/应用宝各提一次，每家 1-7 天 |
| **正式签名** | 1 小时 | 生成 keystore，配置 release 构建（当前是 debug 签名，**不能上架**） |
| **SDK 备案** | 视情况 | 若用了个推/统计类第三方 SDK 需额外报备 |

### 隐私合规是重点（尤其你有日记数据）
产品涉及**用户的私密文字内容 + 语音录音**，上架时审核方会重点看：
- 是否有明确的隐私政策入口
- 是否说明「日记内容会加密上传到服务器」（你当前是明文存 D1，**这一点可能被问**）
- 是否说明数据删除途径（你有回收站 + 永久删除，够用）
- 录音是否明示取得授权（Manifest 已声明 + 运行时弹窗，符合）

---

## 六、执行路线图

### 阶段 0：出 APK 自用（推荐先做这个）
```
腾空间(≥15GB) → 装JDK → 装Android Studio → npm run cap:apk → 装机验证
```
**产出**：能装到自己手机、能用的 APK。
**验收**：用 `docs/android-app-guide.md` 第七节的 10 条回归清单逐项过。

### 阶段 1：体验打磨（真机跑完之后再定）
- 生成正式图标 + 启动图（用 `public/favicon.svg`）
- 决定字体/图片是否改 CDN 瘦身
- 真机发现的问题修复（键盘遮挡、返回键、状态栏、字体渲染）

### 阶段 2：发布（仅当需要给别人用/上架时）
- 正式签名 + 隐私政策页 + 软著 + 备案
- 各应用市场提交

---

## 七、待你拍板的三个点

1. **图标**：要不要现在就用 `public/favicon.svg` 生成一套正式图标（圆形麦穗/钢笔风格，适配纸感主题）？
2. **体积**：先跑通再优化（推荐），还是现在就做 CDN 瘦身（能省 11.7MB）？
3. **上不上架**：只自用（跳过阶段 2），还是认真考虑上架（需启动软著流程，30-60 天）？

---

## 附：关键文件位置速查

```
项目根：...\TRAE SOLO CN\...\6aa3cefc66f609d7998640ec\mydiary-web

已改：capacitor.config.ts | .env.production | package.json
新增：android/ | docs/android-app-guide.md | docs/android-capsule-snapshot.md
未改：src/**（业务代码零改动）| workers/** | functions/**
```
