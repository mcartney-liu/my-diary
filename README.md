# MyDiary — App 开发副本（Android / Capacitor）

> ⚠️ **这是一份「App 专用副本」，不是 Web 生产副本。**
>
> | | Web 生产副本 | 本副本（App 专用） |
> |---|---|---|
> | 位置 | `...\TRAE SOLO CN\...\6aa3cefc66f609d7998640ec\mydiary-web` | `C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android` |
> | 角色 | 线上 `app.callmydiary.online` 跑的生产代码 | 打安卓 APK 用 |
> | 套壳文件 | ❌ 永不含 | ✅ 全在这里 |
>
> **套壳专属文件（只在本副本）**：`android/`、`capacitor.config.ts`、`.env.production`
>
> 日常流程：Web 副本改代码 → 推 GitHub → 本副本 `git pull` → `npm run cap:apk` → 装手机。
> 详见 `docs/android-sync-guide.md`。

## 出安卓包

```bash
npm run cap:apk        # 构建 + 同步 + 编译 APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**前置条件**：JDK 17 + Android SDK（需装在 D 盘，见 `docs/android-env-setup.md`）

## 相关文档

| 文档 | 内容 |
|---|---|
| `docs/android-env-setup.md` | D 盘环境安装清单（先看这个） |
| `docs/android-app-guide.md` | 真机验证指南 + 10 条回归清单 |
| `docs/android-sync-guide.md` | 原项目更新 → 同步出包流程 |
| `docs/android-rollout-plan.md` | 落地方案（体积分析、WebView 坑位、上架合规） |
| `DEPLOY.md` | Web 端部署运维手册（原项目同款） |

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
