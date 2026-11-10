# MyDiary — 完整产品仓库

> **本仓库是唯一的生产代码库**。Web（`app.callmydiary.online`）、Worker API、Android Capacitor 套壳都在这一份里。不存在独立的"Web 生产副本"或"App 专用副本"。
>
> Android 套壳专属文件（只在本仓库）：`android/`、`capacitor.config.ts`
>
> 日常流程：改代码 → `git push` → Cloudflare Pages/Worker 自动部署；Android 套壳：`npm run cap:sync` → `npx cap sync android` → 出 APK。
> 详见 `docs/android-app-guide.md`、`DEPLOY.md`。

## 出安卓包

```bash
npm run cap:apk        # 构建 + 同步 + 编译 APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**前置条件**：JDK 21 + Android SDK（需装在 D 盘，见 `docs/android-env-setup.md`）

## 相关文档

| 文档 | 内容 |
|---|---|
| `docs/android-env-setup.md` | D 盘环境安装清单（先看这个） |
| `docs/android-app-guide.md` | 真机验证指南 + 10 条回归清单 |
| `docs/android-sync-guide.md` | 原项目更新 → 同步出包流程 |
| `docs/android-rollout-plan.md` | 落地方案（体积分析、WebView 坑位、上架合规） |
| `DEPLOY.md` | Web 端部署运维手册（原项目同款） |
