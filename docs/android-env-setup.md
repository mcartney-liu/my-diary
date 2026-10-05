# Android 开发环境安装清单（全部装 D 盘）

> 📅 2026-10-05 ｜ 状态：**待安装**
> 原因：C 盘仅剩 8.9GB，Android Studio + SDK 需 10-15GB，装不下。D 盘有 20GB 可用。

---

## 为什么要装 D 盘（背景）

| 盘 | 可用 | 够不够 |
|---|---|---|
| C: | 8.9 GB | ❌ 不够（需 10-15GB） |
| **D:** | **20 GB** | ✅ 刚好（装完剩约 5GB 余量） |

代码副本放 C 盘（干活快），**Java 环境全部放 D 盘**（没得选，必须）。

---

## 一、空间预算（D 盘）

| 组件 | 预计空间 | 装到哪 |
|---|---|---|
| JDK 17 | ~300 MB | `D:\Android\jdk` |
| Android Studio 本体 | ~4 GB | `D:\Android\Android Studio` |
| Android SDK Platform 36 | ~1 GB | `D:\Android\Sdk` |
| Android SDK Build-Tools | ~0.5 GB | `D:\Android\Sdk` |
| Android SDK Platform-Tools | ~0.2 GB | `D:\Android\Sdk`（含 adb） |
| Gradle 缓存 | ~1.5 GB | `D:\Android\.gradle` |
| **合计** | **~7.5 GB** | D 盘剩 20GB，**装完还剩约 12GB** |

> 代码副本（mydiary-android，含 node_modules）留在 C 盘，约 600MB。

---

## 二、安装顺序

### Step 1：装 JDK 17

> ⚠️ **实测踩坑（2026-10-05）**：本机当前会话是**普通用户权限**（`net session` 报无权限），
> `winget install Microsoft.OpenJDK.17` 会因 MSI 需要管理员授权而 **失败（退出码 1603）**，
> UAC 弹窗在无人值守环境下无法交互。
>
> ✅ **解决方案：改用官方便携版 ZIP，免管理员权限。**

**方式 A（推荐，已实测可行）：便携版 ZIP**

```bash
# 下载（约 180MB）
curl -L -o D:\Android\jdk17.zip \
  "https://aka.ms/download-jdk/microsoft-jdk-17.0.20.1-windows-x64.zip"

# 解压
cd D:\Android && tar -xf jdk17.zip
# 解压后目录名形如 jdk-17.0.20.1+8，可重命名为 jdk
```

解压后 `java.exe` 就在 `D:\Android\jdk\bin\java.exe`，直接可用。

**方式 B：你自己用管理员身份运行**

用 PowerShell（右键"以管理员身份运行"）：
```powershell
winget install --id Microsoft.OpenJDK.17 --location "D:\Android\jdk"
```

装完设环境变量：
- `JAVA_HOME=D:\Android\jdk`（或实际解压目录）
- PATH 加 `%JAVA_HOME%\bin`
- `GRADLE_USER_HOME=D:\Android\.gradle`


### Step 2：装 Android Studio（需你手动，图形界面）

1. 下载：https://developer.android.com/studio
2. 安装时**第一屏就选路径**：`D:\Android\Android Studio`
3. 首次启动会下 SDK，**这时改 SDK 位置**：
   - `Settings` → `Languages & Frameworks` → `Android SDK`
   - `SDK Location` 改成 `D:\Android\Sdk`
4. `SDK Manager` → `SDK Platforms` 勾 **Android 16 / API 36**
5. `SDK Tools` 勾 **Android SDK Build-Tools**、**Android SDK Platform-Tools**

### Step 3：设 Gradle 缓存到 D 盘（省 C 盘 1.5GB）

在**系统环境变量**里新增：
### Step 3：设 Gradle 缓存到 D 盘 — ✅ 已完成

用户级环境变量已写入（无需管理员）：
```
JAVA_HOME        = D:\Android\jdk-17.0.20.1+1
GRADLE_USER_HOME = D:\Android\.gradle
PATH             已追加 %JAVA_HOME%\bin
```

`android/local.properties` 已写好（指向 D 盘 SDK）：
```properties
sdk.dir=D\:\\Android\\Sdk
```

### Step 4：验证环境

```bash
java -version          # ✅ 已验证：openjdk 17.0.20.1 LTS
adb version            # ⬜ 待装 Android Studio 后才有
```

### 当前进度（2026-10-05 实测）

| 组件 | 状态 | 位置 |
|---|---|---|
| JDK 17.0.20.1 | ✅ 已装 | `D:\Android\jdk-17.0.20.1+1`（303MB） |
| **JDK 21.0.9 LTS** | ✅ **已装（编译必需）** | `D:\Android\jdk-21.0.9+10`（330MB） |
| 环境变量 | ✅ 已设 | 用户级（无需管理员） |
| Gradle 缓存目录 | ✅ 已建 | `D:\Android\.gradle` |
| `local.properties` | ✅ 已写 | `android/local.properties` |
| **Android Studio** | ✅ **已装** | `D:\Android\Android Studio`（Rabbit 1 \| 2026.2.1） |
| **Android SDK** | ✅ **已装** | `D:\Android\Sdk`（platform 37、build-tools 36+37、platform-tools 37.0.1） |
| **APK 产物** | ✅ **已产出** | `android/app/build/outputs/apk/debug/app-debug.apk`（14MB） |

> ⚠️ **必须用 JDK 21 编译**（Capacitor 8 要求 source/target 21，用 JDK 17 会报「无效的源发行版：21」）：
> ```bash
> export JAVA_HOME='D:\Android\jdk-21.0.9+10'
> export GRADLE_USER_HOME='D:\Android\.gradle'
> export ANDROID_HOME='D:\Android\Sdk'
> export ANDROID_SDK_ROOT='D:\Android\Sdk'
> cd .../mydiary-android/android && ./gradlew.bat assembleDebug --no-daemon
> ```
> 注：Git Bash 里路径要用**单引号**，双引号会把反斜杠吞掉。

## 联网适配（已写入 build.gradle / settings.gradle）

公司网络下 `dl.google.com` 解析不稳定，已加**腾讯云 Maven 镜像**优先命中：
```groovy
maven { url 'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/' }
```
> ⚠️ **阿里云镜像未同步 androidx（会 404），别用。**
> ⚠️ `pluginManagement {}` 必须是 `settings.gradle` 的**第一句**，否则 Gradle 语法报错。

---

## 三、装好后怎么出 APK

```bash
cd C:\Users\haizhi\WorkBuddy\2026-09-23-11-40-59\mydiary-android

# 一条命令：构建前端 + 同步资源 + 编译 APK
npm run cap:apk

# 产物
android/app/build/outputs/apk/debug/app-debug.apk

# 装到手机（数据线连上，手机开 USB 调试）
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 四、常见问题

**Q: Gradle 报错「SDK location not found」**
A: `android/local.properties` 缺 SDK 路径。内容应为 `sdk.dir=D:\\Android\\Sdk`（我出包时会自动生成）

**Q: 编译报 Java 版本不对**
A: `java -version` 不是 17，检查 `JAVA_HOME` 指向

**Q: adb 找不到**
A: `D:\Android\Sdk\platform-tools` 没进 PATH

**Q: D 盘空间不够了**
A: 删 `D:\Android\.gradle\caches` 可临时释放约 1GB（会自动重新下载）

---

## 五、卸载/迁移提示

- **卸载 Android Studio**：`D:\Android\Android Studio\bin\studio64.exe` 运行后 uninstall
- **彻底清 D 盘环境**：直接删 `D:\Android` 整个目录即可，不影响 C 盘代码副本
- **C 盘代码副本可随时删**：`rm -rf mydiary-android` 即可重新 clone

---

## 六、状态追踪

| 项 | 状态 |
|---|---|
| 代码副本（C 盘 mydiary-android） | ✅ 已就位（HEAD=`12cea49`） |
| 依赖 + Capacitor | ✅ 已装 |
| 构建 + 同步 | ✅ 通过 |
| **JDK 17.0.20.1** | ✅ **已装并验证**（`D:\Android\jdk-17.0.20.1+1`） |
| 环境变量 | ✅ 已设（用户级） |
| Gradle 缓存目录 | ✅ 已建（`D:\Android\.gradle`） |
| `local.properties` | ✅ 已写（指向 D 盘 SDK） |
| **Android Studio** | ⬜ **待装**（需图形界面，翔哥装） |
| **Android SDK** | ⬜ 待装 |
| **APK 产物** | ⬜ 未产出 |

### 本次安装踩坑

1. **winget 装 JDK 失败（退出码 1603）** — 本机当前会话是**普通用户权限**，MSI 需管理员授权，UAC 无法交互。**改用官方便携版 ZIP**（`aka.ms/download-jdk/...-windows-x64.zip`）解压即用，免管理员。已写进 Step 1。
2. **Git Bash 的 `tar` 不认 zip** — 报 `This does not look like a tar archive`。改用 PowerShell `Expand-Archive` 成功。
3. **`printf` 写 `local.properties` 反斜杠被吞** — 写出了 `D:////Android////Sdk/n`。改用编辑器写标准 Java properties 格式 `D\:\\Android\\Sdk`。
