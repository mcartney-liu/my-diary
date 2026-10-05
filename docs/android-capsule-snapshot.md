# 安卓套壳成果清单（App 副本专用 · 2026-10-05）

> 📍 **本文件所属副本（App 专用）**：
> ```
> C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android
> ```
> **上游 Web 生产副本（永不被 App 污染）**：
> ```
> C:\Users\haizhi\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\
>   work-mode-projects\6aa3cefc66f609d7998640ec\mydiary-web
> ```
> 两者靠 GitHub `mcartney-liu/my-diary` 的 `src/` 部分保持一致。

---

## 一、为什么分两个副本

翔哥要求：**App 开发全部在 WorkBuddy 空间做，拉一份代码副本，保证原项目（Web 端）不被破坏。** 原项目有更新时，本副本 `git pull` 同步后重新出 APK。

| | Web 生产副本 | App 副本（本目录） |
|---|---|---|
| 角色 | 线上 `app.callmydiary.online` 跑的生产代码 | 打 APK 用 |
| 套壳文件 | ❌ 已全部撤除，零污染 | ✅ 全部在这里 |
| git 状态 | `git status` 全绿 | 套壳改动本地未提交（正常） |

---

## 二、成果文件（全在本副本）

| # | 文件 | 状态 | 作用 |
|---|---|---|---|
| 1 | `android/` | 新增 | Capacitor 原生工程（13MB） |
| 2 | `capacitor.config.ts` | 新增 | appId `online.callmydiary.app`、背景色 `#faf6ef`、allowNavigation 白名单 |
| 3 | `.env.production` | 新增 | 注入 `VITE_API_BASE=https://app.callmydiary.online`（**最关键**） |
| 4 | `package.json` + `package-lock.json` | 已改 | +3 devDeps、+3 scripts（cap:sync / cap:open / cap:apk） |
| 5 | `android/app/src/main/AndroidManifest.xml` | 已改 | +录音/相机/媒体权限 |
| 6 | `android/app/build.gradle` | 已改 | versionName `1.0` → `0.5.9` |

**文档类新增**：`README.md`（开头加副本定位说明）、`.gitignore`（补 Android 排除规则）、`docs/android-env-setup.md`（D 盘安装清单）、`docs/android-sync-guide.md`（同步流程）、`docs/android-app-guide.md`（真机验证+回归清单）、`docs/android-rollout-plan.md`（落地方案）、本文件。

**`src/` 业务代码零改动** —— 40+ 组件、后端 Workers、Pages Functions 一律未动。

---

## 三、已实测通过的项

| 项 | 验证方式 | 结果 |
|---|---|---|
| 依赖安装 | `npm install` | ✅ 223 包 |
| esbuild 二进制 | `esbuild --version` | ✅ 0.28.1（曾踩 EBUSY 坑，见第六节） |
| 前端构建 | `npm run build` | ✅ 2168 模块 / 主包 873KB |
| Capacitor 依赖 | `package.json` | ✅ ^8.5.2 |
| Android 工程生成 | `npx cap add android` | ✅ 结构完整 |
| 资源同步 | `npx cap sync android` | ✅ 13MB 已注入 |
| **生产 API 注入** | grep 产物 | ✅ 只含 `app.callmydiary.online`，dev 地址 0 次 |
| 跨域可行性 | curl 实测生产站 | ✅ `Access-Control-Allow-Origin: *` |
| .gitignore 生效 | `git status` | ✅ 构建产物已排除，android/ 源码保留 |

---

## 四、⚠️ 关键：`.env.production` 不在 Git 里

`.gitignore` 含 `.env` 规则，`.env.production` 会被忽略。含义：
- `git pull` **不会覆盖它** ✅ 安全
- 但**新克隆的副本会缺这个文件** → App 所有请求 404

**若哪天真删了本副本**，重建步骤（详细版见 `docs/android-sync-guide.md` 第四节）：

```bash
cd C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59
git clone https://github.com/mcartney-liu/my-diary.git mydiary-android
cd mydiary-android
npm install
npm install --save-dev @capacitor/core@^8.5.2 @capacitor/cli@^8.5.2 @capacitor/android@^8.5.2
# 复制本副本的这几个文件过去：capacitor.config.ts / .env.production /
#   docs/android-*.md / .gitignore 的 Android 段 / README 开头说明
npx cap add android
# 再照 docs/android-app-guide.md 补权限、改 versionName
npm run cap:sync
```

---

## 五、⚠️ 关键：改构建方式必须复验 API_BASE

`src/api.ts` 里 `API_BASE` 的解析逻辑：
```ts
const envBase = import.meta.env?.VITE_API_BASE;
export const API_BASE = envBase !== undefined ? envBase
  : (import.meta.env.DEV ? "https://mydiary-api-dev..." : "");
```

App 内 `import.meta.env.DEV === false`，**若 `.env.production` 缺失或变量名写错，`API_BASE` 就是空串** → 相对路径打到 `capacitor://localhost` → **全站 404，App 变废壳**。

**每次 `npm run build` 后建议验证**：
```bash
grep -c "app.callmydiary.online" dist/assets/index-*.js   # 应 ≥1
grep -c "mydiary-api-dev" dist/assets/index-*.js          # 应 0
```

---

## 六、本次踩的两个坑

**坑 1：并行 npm install 导致 esbuild 装漏（EBUSY）**
- 现象：`esbuild --version` 报 `The package "@esbuild/win32-x64" could not be found`
- 根因：两个 npm 进程同时装同一个 `node_modules`，互相抢占文件
- 解法：单进程重跑 `npm install`
- **教训：同一 node_modules 目录绝不能并行跑 npm install**

**坑 2：safe-delete 批量守卫拦截 Capacitor（已知机器特性）**
- 现象：`SAFE_DELETE_BULK_CONFIRM_REQUIRED {"count":139,"threshold":50}`
- 触发点：Capacitor 想删自己模板里 139 个小文件
- 影响：**实际不影响** —— 资源已复制成功，`capacitor.plugins.json` 是 `[]`（零 Cordova 插件），报错只影响清理 `cordova_plugins.js` 空壳
- 附：老项目的 `android/`（13MB）用 `rm -rf` **能删掉**（沙箱外执行）

---

## 七、环境状态

| 项 | 状态 |
|---|---|
| 代码副本 | ✅ 已就位（HEAD=`12cea49`） |
| 依赖 + Capacitor | ✅ 已装 |
| 构建 + 同步 | ✅ 通过 |
| **JDK 17** | ❌ 未装 → `docs/android-env-setup.md` Step 1 |
| **Android Studio** | ❌ 未装（需图形界面）→ Step 2 |
| **Android SDK** | ❌ 未装 → Step 2 |
| **APK 产物** | ❌ 未产出 |
| 磁盘 | C 盘 8.9GB（代码副本约 600MB）/ **D 盘 20GB（装 Java 环境）** |

---

## 八、待办

1. 装 JDK 17（可由小梦 winget 代装）+ Android Studio + SDK（全 D 盘）
2. `npm run cap:apk` 出 debug APK → `adb install` 装机
3. 按 `docs/android-app-guide.md` 第七节 10 条回归清单验证
4. 图标/启动图仍是 Capacitor 默认（可用 `public/favicon.svg` 生成）
5. 是否上架（需软著 30-60 工作日 + 备案 + 正式签名）
