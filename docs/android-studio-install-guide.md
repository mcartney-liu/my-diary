# Android Studio 安装指南（照着点就行）

> 📅 2026-10-05 ｜ 版本：**Android Studio Quail 4 | 2026.1.4**
> 预计耗时：30-45 分钟（含下载 1.5GB + 装 SDK）
> 目标：全部装到 **D 盘**（C 盘只剩 7.8GB，装不下）

---

## ⚠️ 安装前必看

| 事项 | 说明 |
|---|---|
| **需要管理员权限** | 安装时会弹 UAC 授权框 → **点「是」**。这是你手动操作，不像我用 winget 会卡住 |
| **装完占空间** | Studio 约 4GB + SDK 约 6GB = **约 10GB**，D 盘有 20GB，够 |
| **下载慢的话** | 官网下载可能很慢，可换国内镜像：`https://androidstudio.com.cn/download.html` |
| **别装错版本** | 认准 **Windows (64-bit) .exe**，不要下 .zip（免安装版，位置会乱） |

---

## Step 1：下载安装包（1.5GB）

**官方地址**（推荐，最新 2026.1.4）：
```
https://developer.android.com/studio
```
往下滚到「Downloads」区块，找 **Windows (64-bit)** 那行，点 **Download**。

**如果官网打不开或太慢**，用国内镜像：
```
https://androidstudio.com.cn/download.html
```
下 `2026.1.1 | 1,085 MB` 的 Windows .exe 也能用（版本略旧，无所谓）。

> 💡 **建议下载位置也放 D 盘**：浏览器下载默认到 `C:\Users\haizhi\Downloads`，1.5GB 会占 C 盘空间。
> 下载时在浏览器里改路径，或下载完**剪切**到 `D:\Android\`。

---

## Step 2：安装 Android Studio 到 D 盘

双击下载的 `.exe`。

### 2.1 安装向导第 1 屏：选组件

会让你选装哪些组件。**建议这样选**：

| 勾选 | 说明 |
|---|---|
| ✅ **Android Studio** | 必选 |
| ✅ **Android SDK** | 必选（后面要装 Platform 36） |
| ✅ **Android Virtual Device** | 可以不勾，我们用真机测，不开模拟器（省 2GB） |
| ❌ Performance enhancements (Intel) | **不勾**，这是模拟器加速相关，用真机不需要 |

> 实在拿不准就全默认，等下 SDK 也能在设置里补装。

### 2.2 第 2 屏：**⚠️ 关键 —— 改安装路径**

默认会装到 `C:\Program Files\Android\Android Studio`，**这一步必须改**：

```
点 Browse... → 输入或选择：
D:\Android\Android Studio
```

> 📌 一定要在装之前改。装完再挪会很麻烦，而且 C 盘可能撑不住。

### 2.3 之后一路 Next / Install

会开始解压和安装，等进度条跑完（约 5-10 分钟）。

### 2.4 装完点 Finish

---

## Step 3：首次启动 + 改 SDK 位置到 D 盘

启动 Android Studio，会弹「Welcome / 隐私政策」之类的欢迎页。

### 3.1 同意条款

第一次启动会要求同意 Google 的条款和隐私政策，**勾选接受 → Continue**。

### 3.2 是否有向导？选 Standard 或 Skip

如果弹出「Setup Wizard」：
- 选 **Standard**（标准配置）
- 或点 **Skip**（跳过）—— 也能用，后面手动装 SDK 就行

### 3.3 ⚠️ 关键：改 SDK Location 到 D 盘

菜单：**File → Settings**（快捷键 `Ctrl + Alt + S`）

左侧树找到 **Languages & Frameworks → Android SDK**

顶部有 **SDK Location** 输入框：
```
默认可能是：C:\Users\haizhi\AppData\Local\Android\Sdk
改成：     D:\Android\Sdk
```

> 📌 如果 D:\Android\Sdk 不存在，直接输入这个路径，SDK Manager 会自己建。

---

## Step 4：装 SDK 组件（关键，别漏）

还在 **Android SDK** 设置页，左边选 **SDK Platforms** 或 **SDK Tools** 标签。

### 4.1 SDK Platforms 标签

勾选：
- ✅ **Android 16.0 (API 36)** ← **必须！** 你的项目 `targetSdk = 36`

> ⚠️ 如果列表里没有 API 36，勾右上角 **Show package details** 才会显示。

### 4.2 SDK Tools 标签

勾选：
- ✅ **Android SDK Build-Tools**（选最新的 36.x）
- ✅ **Android SDK Platform-Tools**（含 adb，必须）
- ✅ **Android SDK Command-line Tools (latest)**（如没自动勾上，手动勾）

**不需要**的（省空间）：
- ❌ Android Emulator（用真机，不开模拟器）
- ❌ Google Play Services 等系统镜像

### 4.3 点右下角 **Apply → OK**

开始下载安装，约 2-5GB。**这一步等着就行。**

---

## Step 5：验证环境

装完后告诉我，我帮你跑验证。或者你自己在 PowerShell 里查：

```powershell
# ① adb 在哪
$env:ANDROID_HOME = "D:\Android\Sdk"
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
adb version

# ② SDK 组件是否装齐
sdkmanager --list_installed
```

---

## Step 6：出 APK（这步交给我）

装完 SDK 后跟我说一声，我在你那个副本里跑：

```bash
cd C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android
npm run cap:apk
```

产物：
```
android/app/build/outputs/apk/debug/app-debug.apk
```

然后装手机：
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔴 可能遇到的三个问题

**Q1: 安装时 UAC 弹不出来 / 提示权限不足**
A: 右键 `.exe` → **「以管理员身份运行」**。

**Q2: C 盘还是被占了**
A: 说明 Step 2.2 改路径没改成功。卸载重装，**这次一定在第 2 屏改路径**。
另外下载的 1.5GB 安装包也记得删掉。

**Q3: SDK 列表里找不到 API 36**
A: 勾选 **Show package details** 才会显示预览版/新版本。

**Q4: 装完 D 盘空间不够**
A: 优先砍 Android Emulator（3GB+），你用真机根本不需要。SDK Manager 里取消勾选即可。

---

## 📊 装完后的空间账

| 项 | 位置 | 大小 |
|---|---|---|
| JDK 17 | `D:\Android\jdk-17.0.20.1+1` | ✅ 303MB（已装） |
| Android Studio | `D:\Android\Android Studio` | ~4GB |
| Android SDK | `D:\Android\Sdk` | ~6GB |
| Gradle 缓存 | `D:\Android\.gradle` | ~1.5GB（下载后） |
| **合计** | 全在 D 盘 | **~11.5GB** |
| D 盘剩余 | | 20GB → 装完剩 **约 8.5GB** ✅ |

C 盘不受影响 ✅（代码副本 ~600MB 已在里面）

---

## ✅ 完成后你会看到

- 桌面有 Android Studio 快捷方式
- `D:\Android\` 下有 `jdk-17.0.20.1+1`、`Android Studio`、`Sdk`、`.gradle` 四个目录
- 手机插数据线能 `adb devices` 看到设备

然后跟我说一声，我直接出 APK 给你。
