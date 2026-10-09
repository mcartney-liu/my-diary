# App 与 Web 协作规矩（APP-SYNC-RULES）

> 📅 2026-10-06 ｜ 适用范围：MyDiary 项目（Web 端 + Android App）
> 目标：**一个功能只写一次**，Web 端是主干，App 跟着同步，长期不分叉。

---

## 一、核心原则

```
Web 端 = 主干（业务逻辑、UI 全部在这里改）
App 端 = 运行壳（套壳 + 平台适配，不重复开发业务）
```

**为什么这么定**：App 和 Web 共用同一份 `src/`。如果两边各自改，功能会分叉、冲突、丢代码。

---

## 二、两个副本的关系

| | Web 生产副本 | App 开发副本 |
|---|---|---|
| **位置** | `...\TRAE SOLO CN\...\6aa3cefc66f609d7998640ec\mydiary-web` | `C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android` |
| **角色** | 线上 `app.callmydiary.online` 跑的生产代码 | 打 APK 用 |
| **谁改** | 翔哥 + Web 端同事 | 小梦（只改平台适配 + 套壳） |
| **套壳文件** | ❌ 零污染 | ✅ 全部在这里 |

两者靠 GitHub `mcartney-liu/my-diary` 的 `src/` 保持一致。

---

## 三、平台差异的唯一收口处 ⭐

**所有平台差异必须写在 `src/platform.ts`**（这是唯一允许写平台判断的文件）。

### 业务组件怎么用

```ts
import { platform } from "./platform";

// ✅ 正确：问能力，不判平台
if (platform.capabilities.speechRecognition) { ... }

// ❌ 错误：业务组件里写平台判断
if (window.Capacitor) { ... }
```

### `platform.ts` 已封装的能力

| 成员 | 说明 |
|---|---|
| `isNativeApp` / `isWeb` | 是否 Capacitor 原生 App |
| `name` | `'android' \| 'ios' \| 'web'` |
| `isDevBackend` | 连的是测试还是生产后端 |
| `getToken` / `setToken` | token 存取（key 判定在这里） |
| `capabilities.speechRecognition` | ⚠️ WebView **不支持**（App 里为 false） |
| `capabilities.audioRecording` | 两边都支持 |
| `capabilities.imagePick` | 两边都支持 |
| `onAppResume(cb)` | 切回前台回调（封装 visibilitychange） |

### 加新能力的标准流程

1. 在 `platform.ts` 的 `capabilities` 里加一项
2. 在 `platform` 对象里挂上
3. 业务组件问 `platform.capabilities.xxx`
4. **不要**在业务组件里写 `if (isApp)`

---

## 四、文件改动边界

### App 副本可以改（且应该改）

| 文件 | 改什么 |
|---|---|
| `android/**` | 原生工程、权限、图标、启动图 |
| `capacitor.config.ts` | appId、背景色、导航白名单 |
| `.env.production` | 生产 API 地址（**仅 App 副本有**） |
| `src/platform.ts` | ⭐ **平台差异唯一收口处** |
| `docs/android-*.md` | 安卓相关文档 |

### ❌ 不该出现在 App 副本的改动

- 业务逻辑（业务逻辑只在 Web 端写）
- 平台判断散落到 `src/components/**`、`src/App.tsx` 等业务文件
- 线上 Web 专用的配置

### 冲突高发文件（同时改会撞车）

| 文件 | 为什么 |
|---|---|
| `src/App.tsx` | 挂载、登录、云端同步都在这 |
| `src/api.ts` | 请求封装 |
| `src/components/EditorPage.tsx` | 编辑器，改动频繁 |

**改这些文件前，必须先 `git pull` 看远端有没有新提交。**

---

## 五、同步流程（每次 Web 端改完）

```
① Web 端改代码 → 自测 → commit → push
        ↓
② 翔哥告诉小梦「改了哪些功能」
        ↓
③ 小梦：git pull origin main
        ↓
④ 小梦：只在 platform.ts / 套壳文件 里做安卓适配
        （若发现 Web 改动影响 App 行为，在 platform.ts 里加兼容，不改业务代码）
        ↓
⑤ 小梦：npm run cap:apk 出包
        ↓
⑥ 翔哥装机验证
```

**实测耗时**：git pull + 出包 **1.5-3.5 分钟**（增量）。

---

## 六、三端同壳架构（为什么 Web 是主干）

三个端本质上是**同一个 Web 应用包不同的壳**：

```
src/ → Vite build → dist/
                      │
        ┌─────────────┼─────────────┐
     直接跑        Capacitor sync  Capacitor sync
     (Web)         Android         iOS
        │              │              │
    浏览器         WebView 壳      WebView 壳
```

**Web 当主干的好处**：

| 好处 | 说明 |
|---|---|
| 开发快 | Vite HMR 50ms 循环，改→看→改，一天迭代上百次 |
| 零门槛 | 不用装任何 native SDK，同事 `npm run dev` 直接跑 |
| 零发布成本 | push → Cloudflare Pages 自动部署 |
| 多端平推 | `platform.ts` 进主干后，iOS 端 pull 就能用，不用自己补 |

### 未来 iOS 端流程（与 Android 完全一致，不需新规矩）

```bash
git clone https://github.com/mcartney-liu/my-diary.git
cd my-diary
npm install
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/ios
npx cap add ios
# 填 .env.production（VITE_API_BASE，App 副本外的环境需自行配置）
# 补 ios/ 套壳（权限、图标、启动图）
npm run cap:sync
npx cap open ios   # Xcode 出包
```

**日常同步**：`git pull` → `cap sync` → Xcode build，**与 Android 同一套流程**。

---

## 七、已知的平台差异（App vs Web）

| 功能 | Web | Android App | 说明 |
|---|---|---|---|
| 日记增删改查 | ✅ | ✅ | 共用同一 API + 同一个 D1 库 |
| 知识库 | ✅ | ✅ | 两边都在 |
| 登录态 | ✅ | ✅ | App 用 prod token key（见 `platform.ts`） |
| 云端同步 | ✅ | ✅ | 切回前台自动刷新（`platform.onAppResume`） |
| **语音快记** | ✅ | ❌ | `SpeechRecognition` WebView 不支持（**待修**） |
| 编辑器录音 | ✅ | ✅ | MediaRecorder 两边都支持 |
| 图片选图 | ✅ | ✅ | `<input type="file">` 两边都支持 |
| 相机拍照（原生） | ❌ | 计划中 | 需接 Capacitor Camera 插件 |

---

## 八、App 专属套壳文件（只在 App 副本存在）

| 文件 | 作用 |
|---|---|
| `capacitor.config.ts` | appId `online.callmydiary.app`、背景色 `#faf6ef` |
| `.env.production` | `VITE_API_BASE=https://app.callmydiary.online`（**必须有，否则 App 全 404**） |
| `android/` | Capacitor 原生工程（源码入库，构建产物 gitignore） |

> ⚠️ **`.env.production` 不在 Git 里**（被 `.gitignore` 排除）。
> 若副本被删，重建时必须补上这个文件，否则 App 所有请求 404。详见 `docs/android-capsule-snapshot.md` 第四节。

---

## 九、给 Web 端同事的说明

如果你在 `src/` 里看到 `platform.ts`，说明：

1. **你不需要改它** —— 它只管平台差异（App vs Web）
2. **你改业务代码时不用管安卓** —— 需要安卓特殊处理的会通过 `platform.capabilities` 问，不会影响你
3. **如果你要加新功能**，只管 Web 端逻辑，写完 push，然后告诉翔哥，App 那边会自动同步 + 适配

**唯一需要留意**：`src/App.tsx`、`src/api.ts`、`src/components/EditorPage.tsx` 这三个文件我偶尔会动（为了安卓适配）。如果你也在改，会冲突——所以你 push 后告诉我一声，我 pull 再动。

---

## 十、给 AI 助手的约束

小梦在 App 副本工作时必须遵守：

1. **动手前先 `git status`** —— 检查文件是否被他人改动，不覆盖
2. **平台判断只写 `src/platform.ts`**
3. **业务文件里的平台差异要往 platform.ts 收**，不改业务逻辑
4. **出包前跑** `npx tsc -b --noEmit` + 确认 `grep -c "app.callmydiary.online" dist/assets/index-*.js` ≥ 1
5. **Web 生产副本零改动**（除非翔哥明确要求）
6. **push / commit / tag 需翔哥拍板**，不得自主执行
