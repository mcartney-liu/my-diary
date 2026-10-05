# 原项目更新 → 同步到 App 的操作手册

> 📅 2026-10-05 ｜ 适用于「App 专用副本」与「Web 生产副本」分离后的日常协作
> 核心原则：**Web 生产副本永不被 App 开发污染；App 副本靠 git pull 跟进上游。**

---

## 一、两个副本的分工

| | Web 生产副本 | App 开发副本 |
|---|---|---|
| **路径** | `C:\Users\haizhi\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6aa3cefc66f609d7998640ec\mydiary-web` | `C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android` |
| **角色** | 线上生产 `app.callmydiary.online` 跑的代码 | 打 APK 用 |
| **套壳改动** | ❌ 永不加 | ✅ 全部集中在这里 |
| **谁在改** | 你日常开发（提交到 GitHub） | 我（Capacitor / android/ / .env.production） |
| **能否删** | ❌ 绝对不能 | ✅ 删了可重新 clone |

**关键约定**：套壳相关文件（`android/`、`capacitor.config.ts`、`.env.production`）**只存在于 App 副本**。Web 生产副本保持零套壳污染。

---

## 二、日常流程：原项目更新后怎么同步

### 场景 A：你在 Web 端改了功能，提交到了 GitHub，现在要出新 APK

```bash
# 1. 进 App 副本
cd C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android

# 2. 拉取上游最新代码
git pull origin main

# 3. 重新构建 + 同步 + 出 APK
npm run cap:apk

# 4. 装到手机
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

> `git pull` 只会更新 `src/`、`public/` 等 Web 代码，**不会动** `android/`、`capacitor.config.ts`、`.env.production`（这几个在本地，且 android/ 的构建产物已被 .gitignore 排除）。

### ⏱️ 实测耗时（2026-10-05，机器：普通办公本）

| 步骤 | 首次（冷启动） | 后续（增量） |
|---|---|---|
| `npm run build`（Vite 打包） | ~50 秒 | ~50 秒 |
| `npx cap sync android` | ~30 秒 | ~3 秒 |
| `gradlew assembleDebug` | ~2 分 26 秒 | **~20-30 秒** |
| **合计** | **~3.5 分钟** | **~1.5 分钟** |

> 结论：**原项目改动 → 新 APK，全程 1.5-3.5 分钟**，不需要重新装环境、不需要重新下依赖。

### ⚠️ 已修复的增量出包 Bug（必读）

**症状**：`cap sync` 成功了，Gradle 也 BUILD SUCCESSFUL，但 **APK 里还是旧代码** —— 装上去发现功能没变。

**根因**：Gradle 的 `:app:packageDebug` 任务**不跟踪 `app/src/main/assets/` 目录变化**。Capacitor 每次 sync 把新 dist 覆盖进去，但 Gradle 认为「Java 源码没变」→ 判为 `UP-TO-DATE` → 不重新打包。

**修复**：`android/app/build.gradle` 里加了 `gradle.taskGraph.whenReady` 钩子，检测到 assets 变化时强制删除 merge 中间产物。日志会打印：
```
[MyDiary] 检测到 web 资源更新，强制刷新 assets 中间产物
```

**你如何自检**：出包后看 APK 文件时间戳是否更新——
```bash
ls -la android/app/build/outputs/apk/debug/app-debug.apk
```
时间戳若还是旧的，说明没重新打包，重跑一次 `gradlew assembleDebug`。

### 场景 B：我改了 App 专属的东西（图标、权限、Capacitor 升级）

这些改动在 App 副本本地，**不 push 到 GitHub**（避免污染 Web 副本）。所以：
- 只存在 App 副本本地
- 若不确定，可备份 `capacitor.config.ts` 等文件

---

## 三、⚠️ 关键风险：.env.production 不在 Git 里

`.gitignore` 里有 `.env*` 规则？**检查一下** —— 如果 `.env.production` 被 git 忽略，那么：
- `git pull` 不会覆盖它 ✅ 安全
- 但**新克隆的副本会缺失这个文件**，导致 App 全 404

**保障措施**：
1. 本副本的 `.env.production` 已存在，缺了就把内容写回去（内容见该文件注释）
2. 若哪天真删了副本，重建步骤见第四节

---

## 四、App 副本被删了怎么重建（完整步骤）

```bash
# 1. 重新克隆
cd C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59
git clone https://github.com/mcartney-liu/my-diary.git mydiary-android
cd mydiary-android

# 2. 装依赖
npm install
npm install --save-dev @capacitor/core@^8.5.2 @capacitor/cli@^8.5.2 @capacitor/android@^8.5.2

# 3. 恢复三个套壳文件（关键！从本空间的备份恢复，或照文档重建）：
#    - capacitor.config.ts  → 复制 android-capsule-snapshot.md 第三节内容
#    - .env.production      → 照抄：VITE_API_BASE=https://app.callmydiary.online
#    - android/ 工程        → npx cap add android，再照 guide 补权限

# 4. 构建 + 同步 + 出包
npm run cap:sync
npm run cap:apk
```

**更简单的办法**：如果本空间还有备份文件，直接复制过来即可（问小梦要）。

---

## 五、版本同步检查清单

出 APK 前，确认拉到的是最新代码：

```bash
# 看 App 副本当前基于哪个 commit
git log --oneline -1

# 看 Web 生产副本 / GitHub 最新是哪个
cd "<Web生产副本路径>" && git log --oneline -1

# 两个应该一致（说明已同步到最新）
# 如果 Web 那边更新了，先在 App 副本 git pull 再出包
```

---

## 六、常见问题

**Q: git pull 会不会把 android/ 删了？**
A: 不会。`android/` 源码在本地未提交（pull 不动未跟踪文件），且构建产物被 .gitignore 排除。

**Q: pull 冲突了怎么办？**
A: App 副本应该很少改 `src/`，冲突概率极低。若真冲突，`git status` 看状态，`git checkout -- <file>` 放弃本地改（以 GitHub 为准），再重做套壳。

**Q: Web 副本也被我改了 App 相关的东西，会不会不同步？**
A: 不会。Web 副本没有套壳文件；App 副本的套壳改动是本地的、独立的。两者靠 GitHub 上的 `src/` 部分保持一致。

**Q: 想让 Web 副本也能出 APK 怎么办？**
A: 不建议（会污染生产）。要出包就切到 App 副本操作。

---

## 七、一句话总结

> **Web 副本改代码 → 提交推 GitHub → App 副本 git pull → npm run cap:apk → 装手机。**
> 
> 套壳相关的三个文件（android/、capacitor.config.ts、.env.production）**永远只在 App 副本**。
