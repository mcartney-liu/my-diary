# Editor AI Assistant：写日记时的小麦 AI 辅助方案

> **核心思想**：在 EditorPage（写日记页）里加一个"迷你小麦助手"——悬浮气泡入口 + 迷你对话窗口 + 一键贴入日记。用户写日记卡壳了，点一下问小麦，回答直接贴进 blocks 里，不用切换页面。

---

## 一、背景 & 问题

### 现在的 AI 入口在哪

| 入口 | 位置 | 形态 | 问题 |
|---|---|---|---|
| 小麦日记问答 | CalendarPage 顶部按钮 / ProfilePage | `AiDrawer.tsx`（全屏右侧抽屉，max-w-md） | ❌ **EditorPage 里没有入口！** 写日记时想找小麦要灵感，必须切走 |
| 知识库问答 | KnowledgeBase 页面内部 | 内嵌 | ✅ 只在知识库场景里 |

### 用户写日记时的真实场景

```
场景 A：卡壳了
  今天发生了很多事，但不知道从哪开始写...
  → 想让小麦帮忙梳理一下

场景 B：想润色
  写了一段，但感觉不够生动
  → 想让小麦帮我改改

场景 C：想加素材
  想加一句名言 / 一个金句 / 一个心情描述
  → 想让小麦推荐几句，贴进日记

场景 D：忘记了过去
  "我上周有没有写过类似的心情？"
  → 想让小麦查一下我自己的历史日记
```

**这四个场景都发生在 EditorPage 里，但现在用户必须切到 CalendarPage 打开 AiDrawer，查完再切回来**——这个体验是断的。

---

## 二、核心思路

### 交互模型

```
EditorPage（写日记）
│
│  🤖 小麦悬浮气泡（fixed bottom-6 right-6 z-30，直径 48px）
│  ┌─────────┐
│  │   🤖    │  ← 半透明，hover 时完全显示
│  └─────────┘
│
├── 点一下气泡 → 弹出迷你对话窗口（浮层，不是全屏抽屉！）
│   位置：气泡正上方，320px × 400px
│   ┌────────────────────────┐
│   │ 🤖 小麦  ✕  🔄新对话    │
│   │                        │
│   │ ── 快捷建议 ──────────  │
│   │ [润色这段] [起个标题]   │  ← 预设 prompt，一键发送
│   │ [写个结尾] [来句名言]   │
│   │                        │
│   │ 👤 帮我润色这段话...   │
│   │                        │
│   │ 🤖 好的，润色后：      │
│   │ 今天去了超市，花了¥89  │
│   │ 买了牛奶、面包和苹果... │
│   │ （还可以查你的历史）   │
│   │                        │
│   │  ┌──────────────────┐  │
│   │  │ 📌 贴到日记      │  │  ← AI 回答下面的按钮
│   │  └──────────────────┘  │
│   │                        │
│   │  ────────────────────  │
│   │  [问点什么吧…]    [发送]│
│   └────────────────────────┘
│
├── 用户点 📌 贴到日记
│   → 在当前 blocks 数组末尾插入一个新 text block
│   → content = 【小麦建议】+ AI 的回答
│   → style = 灰色底（视觉上区分 AI 和手写）
│
└── 用户继续写日记 / 继续问小麦
```

### 和现有 AiDrawer 的区别

| | AiDrawer（现有） | MiniAiBubble（新增） |
|---|---|---|
| **入口位置** | CalendarPage / ProfilePage 按钮 | **EditorPage 悬浮气泡** |
| **UI 形态** | 全屏右侧抽屉（max-w-md） | **迷你浮层（320×400px）** |
| **定位** | 独立 AI 问答页面 | **写日记时的辅助工具** |
| **能贴进日记** | ❌ | ✅ |
| **快捷建议** | 4 个通用（"我写过什么主题"） | **4 个写作相关**（"帮我润色"、"来句名言"） |
| **对话历史** | 用户关闭后清空（AiDrawer 本身没持久化） | 同——只保留当前 EditorPage 会话期间 |

### 快捷建议（预设 prompt）

| 建议 | 实际发送给 AI 的 prompt |
|---|---|
| **帮我润色** | `帮我润色下面这段日记，保持原意但让它更生动：\n"${选中文字或光标附近 text block}"` |
| **起个标题** | `给这段日记起 3 个不同风格的标题（简短、文艺、幽默各一个）：\n"${内容}"` |
| **写个结尾** | `给这段日记写一个温暖的结尾（一句话到三句话）：\n"${内容}"` |
| **来句名言** | `推荐 3 句关于"${当前心情}"的名人名言，要简短，标出处。心情：从 diary.moodId 推断或让用户选` |

---

## 三、技术设计

### 3.1 新增组件

**`MiniAiBubble.tsx`**（~250 行）

```typescript
interface Props {
  diaryId: string | null;      // 当前编辑的日记 id（新建时为 null）
  diaryTitle?: string;          // 日记标题（传给 AI 做上下文）
  diaryBlocks?: DiaryBlock[];   // 当前 blocks（AI 可能想参考）
  onAppendBlock: (content: string, kind?: BlockKind) => void;  // 贴进日记的回调
}

interface Msg {
  role: "user" | "ai";
  content: string;
  sources?: { diary_id: string; score: number; date?: string }[];
  canAppend?: boolean;   // AI 的回答可以被贴入
  appendLabel?: string;  // "📌 贴到日记" 或 "📌 作为名言贴入"
}
```

### 3.2 复用现有代码

| 复用 | 来源 | 改吗 |
|---|---|---|
| `api.askDiary(question, history)` | `api.ts` 第 338 行 | ✅ 不改，直接用 |
| AiDrawer 里的 send() 逻辑 | `AiDrawer.tsx` | ✅ 复制过来改成 Mini 版 |
| 对话气泡样式（user/ai 分色） | `AiDrawer.tsx` 第 83-100 行 | ✅ 复用，尺寸缩小 |
| loading 状态 | `AiDrawer.tsx` 第 102-108 行 | ✅ 复用 |
| `/api/ai/ask` Worker 端点 | `workers/src/index.js` | ❌ **完全不改** |

### 3.3 贴入日记的逻辑

```typescript
// EditorPage.tsx 里新增这个 callback
function handleAppendAiContent(content: string) {
  const newBlock: DiaryBlock = {
    id: genId(),
    kind: "text",
    content: `【小麦建议】\n${content}`,
  };
  setBlocks(prev => [...prev, newBlock]);
  // 自动 focus 到新 block
  setTimeout(() => {
    const el = document.querySelector(`[data-block-id="${newBlock.id}"] textarea`);
    el?.focus();
  }, 50);
}
```

### 3.4 可选功能：引用标注样式

```css
/* 小麦贴入的内容：灰色底 + 左边框 + 稍小字号 */
.ai-suggestion-block {
  background: rgba(107, 114, 128, 0.08);
  border-left: 3px solid rgba(107, 114, 128, 0.4);
  border-radius: 0 8px 8px 0;
  padding: 8px 12px;
  font-size: 0.875rem;
  color: #6b7280;
}
```

**实现方式**：block.content 开头有 `【小麦建议】` → 渲染时检测前缀 → 套 ai-suggestion-block className。

### 3.5 悬浮气泡的 UI

```css
.ai-bubble {
  position: fixed;
  bottom: 16rem;  /* 在胶囊坞上面 */
  right: 1.5rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 30;
  transition: transform 0.2s, box-shadow 0.2s;
}

.ai-bubble:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
}

/* 打字时气泡可以临时收起来 */
.ai-bubble-minimized {
  width: 32px;
  height: 32px;
  font-size: 0.875rem;
  opacity: 0.6;
}
```

---

## 四、边界情况

| 场景 | 处理 |
|---|---|
| 用户连续问多个问题 | 对话窗口有 history 数组，传进 askDiary 的第二个参数 |
| 用户关掉对话窗口又打开 | 当前会话清空（类似 AiDrawer 的行为） |
| 用户新建日记后气泡还在 | ✅ 正常——气泡在 EditorPage 渲染，切换日记时 MiniAiBubble 重新挂载，会话清空 |
| AI 回答很长（> 500 字） | 正常显示，对话窗口内部滚动；贴入日记时完整贴入 |
| AI 回答里有 markdown（`**加粗**`、`- 列表`） | 贴入日记时保留纯文本（我们 text block 不支持 markdown 渲染） |
| Worker 返回 401 / 网络错误 | 对话窗口显示 "抱歉，出了点问题"，不影响日记内容 |
| **用户没登录** | 气泡不渲染（EditorPage 本身在 AuthContext 里） |
| 手机上对话窗口太宽 | 320px 足够；小屏手机上对话窗口占满宽度（media query < 380px 时 w-full） |
| 快捷建议的 AI prompt 里需要引用当前日记内容 | 从 props.diaryBlocks 里取最近的 text block content，截前 200 字塞进 prompt |

---

## 五、和其他方案的关系

### 三个方案

| 方案 | 位置 | 改什么 | 状态 |
|---|---|---|---|
| **① Wiki-QA 融合** | `wiki-qa-contract-design.md` | Worker 后端 + KnowledgeBase 组件 | ✅ 已有方案，已实现 |
| **② BookView 书柜** | `template-visual-design.md` | 新增 BookView 组件（BookShelfPage → 书本浏览） | ✅ 方案已定，未开工 |
| **③ Editor AI 辅助** | **本文档** | EditorPage 里加 MiniAiBubble | ✅ 方案已定，未开工 |

### 三者互不冲突

```
方案 ① Wiki-QA  是后端能力（Worker 里 askDiary / askWiki）
方案 ② BookView  是"看"的能力（BookShelfPage → BookView 组件）
方案 ③ Editor AI 是"写"的辅助（EditorPage → MiniAiBubble 组件）

三者正交，可以独立排序、独立开发：
- 方案 ③ 依赖方案 ① 的 API（askDiary）但不依赖方案 ②
- 方案 ② 和 ③ 完全独立
- 方案 ① 是基础设施
```

### 依赖关系图

```
Wiki-QA 融合（后端 askDiary / askWiki API）
    │
    ├── BookView 书柜（不直接用 AI，间接用 wiki page 数据）
    │
    └── Editor AI 辅助（直接用 askDiary API）
```

---

## 六、可选增强（Phase 2+）

| 功能 | 说明 | 优先级 |
|---|---|---|
| **选中文字问小麦** | 用户在 EditorPage 里选中一段文字 → MiniAiBubble 气泡变成 "🤖 润色这段" → 自动把选中文字塞进问题里 | ⭐⭐⭐ |
| **AI 建议分类** | "📌 贴到日记" 旁边加下拉：追加到末尾 / 作为名言 / 作为结尾 | ⭐⭐ |
| **知识库入口** | 对话窗口里可以切换"查日记 / 查我的知识库" | ⭐⭐ |
| **引用历史日记** | AI 回答里附带 "📎 你 9/28 也写过类似的心情" → 点引用的日记 → 自动把那天的标题/日期贴进当前日记 | ⭐⭐⭐ |
| **快捷建议自定义** | 用户可以在 ProfilePage 里编辑自己的快捷建议列表 | ⭐ |
| **对话历史持久化** | 关闭 MiniAiBubble 后重新打开还能看到上次的对话（存 localStorage） | ⭐ |

---

## 七、实现计划

### Phase 1：基础版（2.5 天）

| 步骤 | 内容 | 时间 |
|---|---|---|
| 1 | 新建 `MiniAiBubble.tsx` 骨架（悬浮气泡 + 浮层 + 对话 UI） | 1 天 |
| 2 | 接入 api.askDiary + 4 个快捷建议 + 对话状态管理 | 0.5 天 |
| 3 | EditorPage 里 import 进来 + 渲染悬浮气泡 + handleAppendBlock callback | 0.5 天 |
| 4 | "📌 贴到日记" + 【小麦建议】灰色底样式 | 0.5 天 |

### Phase 2：打磨 + 增强（可选，1.5 天）

| 步骤 | 内容 | 时间 |
|---|---|---|
| 5 | 引用历史日记功能（AI sources 里的 diary_id 可点击） | 0.5 天 |
| 6 | 手机端适配 + 打字时气泡自动收起来 | 0.5 天 |
| 7 | 样式调优（气泡位置、浮层动画、颜色统一） | 0.5 天 |

**总计：约 4 天**

---

## 八、已决策 & 待讨论

### ✅ 已决策

| 项 | 决定 |
|---|---|
| **悬浮气泡位置** | EditorPage 右下角（bottom-6 right-6），在胶囊坞上面 |
| **对话窗口形态** | 迷你浮层（320×400px），不是全屏抽屉 |
| **快捷建议** | 4 个写作相关：润色、起标题、写结尾、来句名言 |
| **贴入日记格式** | `【小麦建议】\n${content}` + 灰色底样式 |
| **数据存储** | 同一份 Diary.blocks[]，贴入就是追加一个 text block |
| **Worker 后端** | 零改动，直接复用 `/api/ai/ask` |
| **对话历史** | 关闭后清空（类似 AiDrawer 的行为） |

### 🔴 待讨论（必须定了才能开工）

| 项 | 选项 | 我的建议 |
|---|---|---|
| **贴入内容要不要保留 AI 的 sources？** | A. 保留（"📎 引用 2 篇历史日记"）/ B. 不保留 | **B 不保留**——贴入的是"纯内容"，sources 留在对话窗口里看就好 |
| **气泡在哪些模板里显示？** | A. 所有模板 / B. 只在 diary / finance / travel 等文字型模板 | **A 所有模板**——哪怕记账模板，用户也可能想让 AI 帮着写备注 |
| **"来句名言"需要用户选心情吗？** | A. 从 diary.moodId 自动推断 / B. 让用户在快捷建议里再选一次 | **A 自动推断**——如果 moodId 为空就用 "中性" |
| **AI 回答能不能**编辑**后再贴入？** | A. 对话窗口里 AI 回答可编辑 / B. 不能，直接贴入原样 | **B 不能**——简单够用，用户贴入后可以在日记里改 |
