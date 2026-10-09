# BookView：书柜 · 书本浏览方案

> **核心思想**：同一个日记/知识库，两套渲染——写的时候是信纸（自由、低门槛），看的时候是书本（聚合、GoodNotes 风）。EditorPage 一行都不动，新增 BookView 组件把零散内容聚合成可翻的"书"。

---

## 一、背景 & 痛点

### 现在的问题

| 场景 | 现状 | 痛点 |
|------|------|------|
| 用户写了 30 篇日记 | 日历视图逐个点进去看 | **感受不到自己的积累** |
| 用户写了 4 篇记账 | 同样日历视图 | 看不到月度汇总，像零散的流水 |
| 用户有 20 个 wiki pages | 知识库列表页 | 像 Excel 表格，**不像一本真的书** |
| 想看"我这一个月写了什么" | 手动翻日历 | 没有聚合视角 |

### 根因

**我们只有"按日期看"的视角，没有"按类型聚合成书"的视角。**

日历是个好工具（找具体某天快），但它不回答"我这一年写了多少东西"、"我 10 月花了多少钱"、"我的数学错题本积累了哪些题"。

### 为什么不应该改 EditorPage（之前的教训）

| 方案 | 效果 | 问题 |
|------|------|------|
| 在 EditorPage 里加 visualSections 覆盖层 | 改写的体验 | ❌ 写日记的心理负担已经够高了，不该让编辑器变复杂 |
| 改 templates.ts defaultBlocks | 写作提示会消失 | ❌ 写作提示依赖 `blocks.every(b => b.kind === "text")`，改了就炸 |
| 只改 className（档 1） | 效果不明显 | ❌ 只覆盖特定 block kind，旧日记看不到变化 |

**结论：EditorPage 保持原样（信纸 + 横线 + 自由排版），不动。新增 BookView 负责"看"。**

---

## 二、核心思路

### 两套独立渲染

| 渲染 | 入口 | 组件 | 视觉 | 数据 |
|---|---|---|---|---|
| **Editor（信纸）** | 大＋按钮 → 新建/编辑日记 | EditorPage（现有，不动） | 信纸背景 + 横线 + 写作提示 + 自由排版 | 一篇 Diary |
| **BookView（书本）** | 📚书柜 → 点某本封面 | BookView（新增） | GoodNotes 风 + 分页 + 书本级聚合 | 一个 templateId 下的**所有** Diary |
| **WikiBook（知识库）** | 📚书柜（新增知识库入口） | BookView（同上，不同 layout） | 目录 + 分类 + 页面分页 | 一个 knowledge_base 下的**所有** WikiPage |

### 关键区别

```
日历视图：  [10/1] [10/2] [10/3] [10/4] ...  ← 按日期平铺，单篇为单位
Editor：   [一篇日记的 blocks]                ← 写/改一篇
BookView： [日记书 · 10月整本]               ← 聚合渲染，"书"为单位
           每页 = 一天的日记（或按月份分页）
           可加统计页、封面页
```

### BookView 不是"换皮"，是"重构"

BookView 里每个 DiaryBlock kind 的渲染**和 EditorPage 里的完全不一样**：

| block kind | EditorPage（信纸） | BookView（GoodNotes 风） |
|---|---|---|
| text | 普通段落，等宽字体 | 手写风字体（`caveat` / `kuralee`）+ 首行缩进 + 段落间距 |
| heading | 加粗 + 装饰竖线（刚加的） | 更大号 + 上下留白更多 + 可以是"月份封面" |
| checkbox | ☐ / 勾选 + 改色 | ✅绿色实心圆 + ✓ / ❌粉红色实心圆 + ✕ + 划线文字 + 卡片背景 |
| finance_item | 表单行（按钮 + 下拉 + 数字） | 支出→粉底色卡 / 收入→绿底色卡 + 大字金额 + 可加图标 |
| number | 数字 + 标签 | 大号右对齐 + 胶囊标签 |
| quote | 摘抄样式 | 左引号装饰 + 斜体 + 灰色底 |
| divider | 细分割线 | 可以是"章节分隔"（"— 第 3 周 —"） |
| image | 内嵌图片 | 大图 + 圆角 + 阴影（书本里图片应该更大） |
| wiki page | N/A | 目录 → 分类 → 页面正文（三级结构） |

### 书的种类 & 分页规则

| 书类型 | 分页依据 | 聚合内容 | 额外页面 |
|---|---|---|---|
| **diary-book** | 每篇日记 → 一页（日记很短可合并） | 所有 diary template 的 diaries | 封面页："📖 2026年10月 · 我的日记" + 统计 |
| **finance-book** | 每月 → 一章，每天一页流水明细 | 所有 finance template 的 diaries | 扉页：月度汇总（支出/收入/结余/分类饼图） |
| **travel-book** | 每篇旅行日记 → 一页 | 所有 travel template 的 diaries | 目的地地图 + 照片墙页 |
| **plan-book** | 每周 → 一页（该周所有 plan） | 所有 plan template 的 diaries | 完成率统计（✅/❌ 比例） |
| **milestone-book** | 每里程碑 → 一章 | 所有 milestone template 的 diaries | 倒计时大字 + 进展时间线 |
| **wiki-book** | 每个分类 → 一章（wiki pages） | 一个 knowledge_base 下所有 WikiPage | 目录页（自动生成） |

---

## 三、BookView 组件设计

### 3.1 架构

```
BookView 组件（新增）
├── 输入：
│   ├── bookType: "diary-book" | "finance-book" | "travel-book" | ...
│   └── source: Diary[]（按 templateId 过滤） | WikiPage[]（按 knowledge_base 过滤）
│
├── PageLayoutEngine（分页引擎，按 bookType 选不同策略）
│   ├── DiaryPager：每篇日记 → 一页，短日记可合并（< 100 字自动和下一篇合并）
│   ├── FinancePager：每月 → 一章，第一章是汇总页，后续是每日明细
│   ├── WikiPager：每个 category → 一章，第一章是目录页
│   └── MilestonePager：每里程碑 → 一章，第一章是倒计时页
│
├── PageRenderer（每页的视觉渲染）
│   ├── CoverPage（封面页）
│   ├── SummaryPage（汇总页，finance / milestone 用）
│   ├── ChapterDivider（章节分隔页，"— 第 3 周 —"）
│   └── DiaryPage（内容页，渲染该页的所有 blocks）
│
└── BlockRenderer（blocks 的"书本版"渲染，按 kind 分发）
    ├── renderTextBlockBook()      ← 手写风字体
    ├── renderHeadingBlockBook()   ← 大号 + 留白
    ├── renderCheckboxBlockBook()  ← ✅绿 / ❌粉
    ├── renderFinanceItemBook()    ← 粉/绿底色卡
    ├── renderNumberBlockBook()    ← 大号右对齐
    ├── renderQuoteBlockBook()     ← 左引号装饰
    ├── renderDividerBlockBook()   ← 章节分隔
    └── renderImageBlockBook()     ← 大图 + 圆角
```

### 3.2 分页引擎核心逻辑（DiaryPager）

```typescript
interface BookPage {
  pageIndex: number;
  pageType: "cover" | "summary" | "chapter-divider" | "content";
  // content 页
  diaries?: Diary[];       // 这一页包含哪些日记
  dateLabel?: string;      // "2026年10月6日"
  weekdayLabel?: string;   // "星期一"
  weatherTag?: string;     // ☀️（从 diary.tags 推断，或 AI 生成）
  moodIcon?: string;       // 😊（从 diary.moodId）
  // summary 页
  summaryData?: BookSummary;
  // chapter-divider 页
  chapterLabel?: string;   // "— 2026年10月 —" 或 "— 第 3 周 —"
}

// DiaryPager 分页逻辑（伪代码）
function paginateDiaryBook(diaries: Diary[]): BookPage[] {
  const pages: BookPage[] = [];
  
  // 1. 封面页
  pages.push({
    pageType: "cover",
    title: "📖 我的日记",
    periodLabel: "2026年9月 — 10月",
    diaryCount: diaries.length,
  });

  // 2. 按月份分组 + 自动分页
  const byMonth = groupBy(diaries, d => dateToMonth(d.date));
  for (const [month, monthDiaries] of byMonth) {
    // 每个月加章节分隔页
    pages.push({ pageType: "chapter-divider", chapterLabel: `— ${month} —` });
    
    // 每篇日记 → 一页（短日记 < 100 字自动合并）
    for (let i = 0; i < monthDiaries.length; i++) {
      const diary = monthDiaries[i];
      // 合并逻辑：如果这篇很短，看下一篇能不能合
      const pageDiaries = [diary];
      if (estimateHeight(diary) < PAGE_100_PERCENT) {
        const next = monthDiaries[i + 1];
        if (next && estimateHeight(pageDiaries) + estimateHeight(next) < PAGE_100_PERCENT) {
          pageDiaries.push(next);
          i++; // 跳过下一篇，已合并
        }
      }
      
      pages.push({
        pageType: "content",
        diaries: pageDiaries,
        dateLabel: diary.date,
        moodIcon: moodEmojiById[diary.moodId],
      });
    }
  }

  // 3. 统计页（最后一页）
  pages.push({
    pageType: "summary",
    summaryData: computeDiarySummary(diaries),
  });

  return pages;
}
```

### 3.3 FinancePager 的额外逻辑（汇总页）

```typescript
function computeFinanceSummary(diaries: Diary[]): BookSummary {
  // 从所有 finance template 的 diaries 中抽取 finance_item blocks
  let totalExpense = 0, totalIncome = 0;
  const byCategory: Record<string, { expense: number; income: number }> = {};
  
  for (const diary of diaries) {
    for (const block of diary.blocks) {
      if (block.kind === "finance_item") {
        const amount = block.value ?? 0;
        if (block.direction === "expense") {
          totalExpense += amount;
          byCategory[block.category].expense += amount;
        } else {
          totalIncome += amount;
          byCategory[block.category].income += amount;
        }
      }
    }
  }
  
  return {
    totalExpense,
    totalIncome,
    balance: totalIncome - totalExpense,
    topCategories: Object.entries(byCategory)
      .sort((a, b) => b[1].expense - a[1].expense)
      .slice(0, 5),
  };
}
```

### 3.4 BlockRenderer — checkbox 的两种渲染

```typescript
// EditorPage 里的 checkbox（信纸，现有代码）
function renderCheckboxEditor(b: DiaryBlock) {
  return (
    <button className={b.checked ? "bg-paper-accent text-white" : "border-paper-line"}>
      {b.checked ? "✓" : ""}
    </button>
  );
}

// BookView 里的 checkbox（GoodNotes 风，新代码）
function renderCheckboxBook(b: DiaryBlock) {
  return (
    <div className={b.checked ? "text-emerald-500" : "text-rose-400"}>
      <button className={b.checked 
        ? "bg-emerald-500 text-white rounded-full w-6 h-6" 
        : "bg-rose-400 text-white rounded-full w-6 h-6"}>
        {b.checked ? "✓" : "✕"}
      </button>
      <span className={b.checked ? "line-through text-gray-500" : ""}>
        {b.content}
      </span>
    </div>
  );
}
```

**两个函数完全独立，互不影响。**

---

## 四、BookView 入口（从书柜点进去）

### BookShelfPage 改造

现在 BookShelfPage 点封面 → 直接进 EditorPage（编辑该类型下新建日记？或者列表？）

改成：点封面 → 进 **BookView 浏览整本**。在 BookView 顶部加一个"＋新建"按钮，点了进 EditorPage。

```
BookShelfPage（书柜）
├── 封面卡片：📖 日记（12 篇）   ← 点这个
├── 封面卡片：💰 账本（4 篇）   ← 点这个
├── 封面卡片：✈️ 旅行（1 篇）
└── 封面卡片：📚 知识库（5 本）   ← 新增，wiki books

点击 📖 日记
  ↓
BookView（diary-book）
├── 封面页："📖 我的日记 · 9月—10月"
├── 章节页："— 2026年10月 —"
├── 第 1 页：10月6日 日记 blocks 渲染
│   [顶部工具栏] [＋新建] [↗ 分享整本书] [print icon 打印 PDF]
├── 第 2 页：10月5日 日记 blocks 渲染
├── ...
└── 统计页：本月写了 12 篇 · 共 3,400 字
```

### BookView 工具栏

```
BookView 顶部固定工具栏：
┌──────────────────────────────────────────────────┐
│ ← 返回  📖 我的日记 12篇   [＋新建] [📤 PDF] [⭐ 收藏] │
└──────────────────────────────────────────────────┘
```

- **＋新建** → 跳 EditorPage，templateId 固定为当前书本类型
- **📤 PDF** → 浏览器原生 window.print()（加 @media print 样式）
- **⭐ 收藏** → 可以未来加

---

## 五、字体选择（手写风）

BookView 里的 text block 用手写风字体，EditorPage 保持等宽字体。

### 候选方案

| 字体 | 来源 | 效果 | 优点 | 缺点 |
|---|---|---|---|---|
| **Caveat** | Google Fonts | 手写，优雅倾斜 | 免费、广支持、多种字重 | 英文更好看 |
| **Kuralee** | Google Fonts | 英文手写，中文普通 | 免费 | 中文手写感弱 |
| **Ma Shan Zheng** | Google Fonts | 中文毛笔风 | 中文好看 | 英文差 |
| **ZCOOL KuaiLe** | Google Fonts | 中文趣味手写 | 免费 | 偏卡通 |

**建议：中英文混合用 Caveat（英文）+ Ma Shan Zheng（中文）的 font-family fallback**。或者先用 Caveat 统一风格，以后再微调。

```css
/* BookView 专属字体 */
.book-text {
  font-family: 'Caveat', 'Ma Shan Zheng', cursive;
  font-size: 1.15rem;
  line-height: 1.7;
  letter-spacing: 0.02em;
}
```

---

## 六、知识库成书（WikiBook）

### 分页规则（和日记书不同）

```
WikiBook 分页：
├── 封面页："📚 数学错题本"
├── 目录页：自动列出所有分类 + 每分类下的页面数
│   📕 一元二次方程 (5)
│   📕 分式方程 (3)
│   📕 应用题 (2)
│
├── 章节页："— 一元二次方程 —"
├── 第 1 页：页面 1 正文
├── 第 2 页：页面 2 正文
├── ...
├── 章节页："— 分式方程 —"
├── 第 N 页：页面 N 正文
└── 统计页：共 10 个页面 · 3 个分类
```

### WikiBook 的 BlockRenderer

和 DiaryBook 不一样，WikiPage 的结构是 `content: string`（Markdown），不是 DiaryBlock[]。所以 WikiBook 用 Markdown 渲染（react-markdown），不是 BlockRenderer。

---

## 七、边界情况

| 场景 | 处理 |
|---|---|
| 用户第一次打开 BookView（还没写过日记） | 显示空状态："📖 还没写过日记呢，点 ＋ 开始第一篇" |
| 只有 1 篇日记 | 封面 + 1 页内容 + 统计页，不会显得太空 |
| 日记非常长（> 500 字） | 自动续页（一页放不下就分两页） |
| 跨月的短日记 | 按月份自动分章，不会混在一起 |
| finance 模板只有流水没备注 | 渲染纯卡片列表，没有 text block |
| 旧日记没有 moodId | 不显示 mood 图标，正常渲染正文 |
| 用户把日记删了（软删除 deleted_at） | listDiaries 已经过滤，不进 BookView |
| 打印 PDF | 加 `@media print` 样式，隐藏工具栏，页边距 2cm，自动分页 |

---

## 八、已决策 & 待讨论

### ✅ 已决策

| 项 | 决定 |
|---|---|
| **EditorPage 一行都不动** | 信纸 + 横线 + 写作提示保留，visualSections 方案废弃 |
| **两套独立渲染** | Editor 渲染器 vs BookView 渲染器，按 kind 分发，完全独立 |
| **BookView 是新增组件** | 不是在 BookShelfPage 里渲染，是独立路由 `/book/:templateId` |
| **书柜点击入口改了** | 点封面 → 进 BookView 浏览，不是进 Editor |
| **短日记自动合并** | DiaryPager 按 PAGE_100_PERCENT 阈值自动合并 < 100 字的连续日记 |
| **finance 需要汇总页** | 自动聚合所有 finance_item blocks 计算月度支出/收入/结余 |
| **知识库也能成书** | WikiBook 用不同的分页引擎（按分类 vs 按日期） |
| **打印 PDF 用 window.print()** | 不装 jspdf / puppeteer，用浏览器原生 + @media print |
| **字体手写风** | BookView 里 text block 用 Caveat 或 Ma Shan Zheng，Editor 保持等宽 |

### 🔴 待讨论（必须定了才能开工）

| 项 | 选项 | 我的建议 |
|---|---|---|
| **BookView 翻页方式** | A. 左右翻页（像真书）/ B. 上下滚动（像阅读器） | **B**，移动端上下滚更自然，CSS 实现也更简单 |
| **finance 汇总要不要饼图** | A. 要（SVG 饼图）/ B. 不要（纯数字表格） | **B** 先不做，纯数字够用，饼图可以以后加 |
| **哪些书类型先做** | A.  diary + finance + wiki / B. 只做 diary + finance | **B** 先 diary + finance 打样，wiki 可以紧接着加 |
| **BookView 要不要支持编辑** | A. 点某页 → 进 EditorPage 编辑该日记 / B. 纯浏览 | **A** 实用，纯浏览太死 |
| **WikiBook 的 markdown 渲染** | A. 用 react-markdown（已有依赖？没查）/ B. 自己写简单版 | 查一下依赖，有就用 react-markdown |
| **"书本"之间的跳转** | 书柜 → BookView → 翻完一页能不能快速切另一个模板 | 加个底部小胶囊坞，和书柜一样的封面小缩略图 |

---

## 九、实现优先级

### Phase 0：地基（1 天）

| 步骤 | 内容 |
|---|---|
| 1 | 查依赖：react-markdown、recharts（图表）、Google Fonts 怎么引入 |
| 2 | 写 BookView.tsx 骨架 + App.tsx 路由 `/book/:templateId` |
| 3 | 改 BookShelfPage 点封面进 BookView（不是 Editor） |

### Phase 1：diary-book 打样（2 天）

| 步骤 | 内容 |
|---|---|
| 4 | DiaryPager 分页引擎（封面 → 章节 → 内容 → 统计） |
| 5 | BlockRenderer（6 种 kind 的"书本版"渲染：text/heading/checkbox/finance_item/quote/divider） |
| 6 | 手写风字体引入 + 样式调优 |
| 7 | 顶部工具栏（返回 / ＋新建 / 打印 PDF） |

### Phase 2：finance-book（1 天）

| 步骤 | 内容 |
|---|---|
| 8 | FinancePager 分页引擎（月度扉页 + 每日明细） |
| 9 | computeFinanceSummary 聚合函数 |
| 10 | finance_item 卡片渲染（支出粉 / 收入绿） |

### Phase 3：wiki-book（2 天）

| 步骤 | 内容 |
|---|---|
| 11 | WikiPager 分页引擎（目录 → 分类章节 → 页面） |
| 12 | react-markdown 渲染 WikiPage content |
| 13 | BookShelfPage 加知识库入口（wiki books） |

### Phase 4：打磨（1 天）

| 步骤 | 内容 |
|---|---|
| 14 | 短日记合并 / 长日记续页 调优 |
| 15 | @media print 样式（打印 PDF） |
| 16 | 空状态 / 加载状态 |
| 17 | 底部胶囊坞（book 之间快速切换） |

**总计：约 7 天**

---

## 十、与之前方案的关系

### 废弃

| 方案 | 状态 |
|---|---|
| EditorPage visualSections 覆盖层 | ❌ 废弃（改写的方向错了） |
| templates.ts 加 visualSections 字段 | ❌ 废弃（不改模板 defaultBlocks） |
| MoodCard / TextCard / StickerBar 新组件 | ❌ 废弃（不需要在写的时候加） |

### 保留

| 方案 | 状态 |
|---|---|
| 书柜功能（BookShelfPage） | ✅ 保留，但改点击行为（进 BookView 不是 Editor） |
| 书柜封面设计（CSS 模拟笔记本封面） | ✅ 保留 |
| 手写风字体选型 | ✅ 保留，转移到 BookView |

---

## 十一、为什么这个方案比 visualSections 好

| 维度 | visualSections（旧） | BookView（新） |
|---|---|---|
| **改什么** | EditorPage（写的流程） | 新增 BookView（看的流程） |
| **Editor 改不改** | 改，加覆盖层 | **不改** |
| **写作提示** | 会被搞坏（改 defaultBlocks） | 完全不影响 |
| **用户感知** | "编辑器换了个皮肤" | "我的日记变成书了！" |
| **工作量** | ~6 天（改 + 新组件） | ~7 天（纯新增，但更复杂） |
| **可渐进** | 到头了（只能覆盖那几个 kind） | 可以加 wiki-book、加打印、加更多统计 |
| **对历史数据** | 需要 retro-fit | **不需要**，BookView 自动按 templateId 聚合 |
| **成败风险** | 中等 | 较高（渲染质量决定一切） |
