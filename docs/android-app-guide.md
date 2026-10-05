# MyDiary 安卓 App（Capacitor 套壳）— 真机验证指南

> 📅 2026-10-04 首次套壳。代码侧已完成，本文档讲「怎么装环境 + 怎么出 APK + 怎么装到手机」。

---

## 一、这次做了什么（已验证通过）

| 项 | 状态 | 说明 |
|---|---|---|
| Capacitor 8.5.2 依赖 | ✅ 已装 | `@capacitor/core` + `cli` + `android`，全在 devDependencies |
| `capacitor.config.ts` | ✅ 新增 | appId `online.callmydiary.app`，背景色 `#faf6ef`（纸感米白） |
| `.env.production` | ✅ 新增 | 注入 `VITE_API_BASE=https://app.callmydiary.online` |
| `android/` 原生工程 | ✅ 生成 | minSdk 24 / targetSdk 36，MainActivity(Java) |
| 权限声明 | ✅ 已加 | 录音 RECORD_AUDIO、相机 CAMERA、媒体读取 |
| 前端构建 | ✅ 通过 | `npm run build` 成功，2168 模块 |
| 资源同步 | ✅ 通过 | `npx cap sync android` 成功，13MB 资产已注入 |

**零业务代码改动** —— `src/` 下一个文件都没碰，所有日记/知识库/AI 逻辑原样保留。

---

## 二、⚠️ 本机还缺两个环境（出 APK 的前提）

本机目前 **没有 Java、没有 Android SDK**（已实测：`java: command not found`、无 SDK 目录、`adb` 不在 PATH）。所以我没法在这台机器上直接出 APK，需要先装：

### 需要装的东西
1. **JDK 17 或 21**（Android Gradle 插件要求 17+）
2. **Android Studio**（自带 SDK，一次装齐，最省事 —— 推荐）
3. Android Studio 装完后在 SDK Manager 里勾：
   - Android SDK Platform 36
   - Android SDK Build-Tools
   - Android SDK Platform-Tools（含 adb）

---

## 三、出 APK 的完整步骤

### 方式一：用 Android Studio（推荐，第一次最省事）

```bash
# 1. 前端构建 + 同步资源
npm run cap:sync

# 2. 用 Android Studio 打开 native 工程
npm run cap:open
#    → 会自动弹出 Android Studio 加载 android/ 目录

# 3. 在 Android Studio 里：Build → Build Bundle(s)/APK(s) → Build APK(s)
#    APK 产出位置：
#    android/app/build/outputs/apk/debug/app-debug.apk

# 4. 装到手机（数据线连上，手机开 USB 调试）
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 方式二：命令行 Gradle（装好 JDK + SDK 后）

```bash
# 一条命令搞定（构建 + 同步 + 出 APK）
npm run cap:apk

# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 四、App 端行为说明（和网页版的差异）

| 功能 | App 里怎么走 | 备注 |
|---|---|---|
| 后端 API | `https://app.callmydiary.online/api/*` | 与网页版**同一套 API + 同一个 D1 库**，数据互通 |
| 登录状态 | 同上，共用账号 | App 登录一次即可 |
| 数据存储 | 内存 + localStorage，登录后以云端为真相源 | 与网页版逻辑完全一致（App.tsx 里那套 dedupe/云端合并） |
| 手写字体 | 6MB MaShanZheng.ttf 已打进包 | **离线也能显示手写体**，这是打包的好处 |
| 语音快记 / 语音转文字 | ⚠️ 走**云端** | 本地 Whisper（`transcribe-server.py`）是你 PC 上的 8080 服务，手机连不到；代码里已有云端 fallback，天然生效 |
| 录音权限 | 首次录音会弹系统授权框 | 已声明 RECORD_AUDIO |
| 离线使用 | ✅ 可打开、可写本地、联网后同步 | 完整离线能力 |

---

## 五、已知限制 / 后续待办

1. **APK 体积约 16-25MB**（assets 13MB + 壳）。想更小可后续优化：
   - 字体改首启后下载（省 6MB）
   - avatars/papers 图片资源懒加载（省 5.7MB）
   - JS 主包 873KB → 可做代码分割
2. **上架应用市场**（如果要上架，需另办）：软著、备案、应用市场审核（小米/华为/OPPO/vivo 等）。这块暂未涉及。
3. **签名**：目前是 debug 签名（只能自己装，不能上架）。上架需生成 keystore 并配置 release 签名。
4. **图标/启动图**：当前是 Capacitor 默认图标。已从你项目 `public/favicon.svg` 拿素材，等你确认后生成正式图标。

---

## 六、常用命令速查

```bash
npm run cap:sync   # 构建前端 + 同步到 Android（改完前端代码跑这个）
npm run cap:open   # 用 Android Studio 打开
npm run cap:apk    # 一条命令出 debug APK
npx cap run android # 直接装到已连接的手机调试
```

---

## 七、回归检查清单（装到手机后逐条看）

- [ ] App 能正常打开，启动无白/黑屏闪烁
- [ ] 能用邮箱验证码登录（收码、登录正常）
- [ ] 首页日历显示正常，主题是纸感米白
- [ ] 手写字体生效（看正文是不是手写体）
- [ ] 写一篇新日记 → 保存成功 → 刷新还在
- [ ] **在网页版登录看这篇日记是否也出现**（验证数据互通）
- [ ] 录音功能能弹权限、能录、有转写结果
- [ ] 知识库能打开、问答正常
- [ ] 图片块能选图/拍照
- [ ] 断网状态下打开 App 仍能进（离线能力）
