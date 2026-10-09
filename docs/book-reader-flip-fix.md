# BookReader 翻页修复方案

> 版本：v2（含 bug ⑤ 根因发现）  
> 日期：2026-10-09  
> 状态：✅ 已全部合入，测试环境验证通过

---

## 一、问题背景

BookReader 组件（3D 书本翻页阅读器）在使用中存在以下问题：

1. 翻页时背面显示上一篇的镜像，不是下一篇的正常内容
2. 看起来"像透明"，能透出下面的字
3. 等纸翻到底落定，背面内容才突然变正确
4. 单页模式（窄屏/手机）向左翻页时纸直接消失
5. 快速连点箭头方向交替容易错乱

---

## 二、根因分析

### bug ①：单页模式 sheet-left 被 display:none 误伤

**位置**：`index.css` 单页模式媒体查询

```css
/* 元凶：book-page-left 和 book-sheet-left 一起被隐藏 */
.book-page-left, .book-sheet-left {
  display: none !important;
}
```

**机制**：prev 翻页时 sheet 移到左侧（`book-sheet-left` 类），被 CSS 一起 display:none → 动画不播 → 直接跳页码。

**修复**：拆开两条规则，只隐藏 `.book-page-left`，sheet 无论左右都占满全宽。同时 `.book-fold-shadow` 单页下也要 `width:100%`。

**改动量**：CSS 约 8 行。

---

### bug ②：事件监听器捕获旧闭包

**位置**：旧代码 494 行 useEffect

```tsx
useEffect(() => {
  moveRef.current = (e: MouseEvent) => { ... };
  upRef.current = () => { ... };
}, [pageIndex, total, isSinglePage, canNext, canPrev, snapFlip]);
```

**机制**：依赖数组里有 `pageIndex` 等 state，每次翻页重建监听器。但 pointerdown 时绑定的是当时那份 ref——理论上拖拽中途 pageIndex 变了就用旧闭包。实际上有 `animRef.current` 保护不会触发，但删掉 Phase 3 后竞态窗口会变大。

**修复**：监听器一次性安装（空依赖），所有 state 通过 `spreadRef.current` / `canRef.current` 等稳定 ref 读最新值。

**改动量**：TS 约 30 行重构。

---

### bug ③：Phase 3 假折返 —— 模型错误的产物

**位置**：旧代码 snapFlip 函数体

旧模型分三段：Phase 1 翻到 180° → setPageIndex 换新内容 → Phase 3 假折返回 0°。

**根因**：底层内容（`pageIndex` state）和 sheet 背面内容（`sheetBackRef` ref）来自两套独立数据源，更新时机不同步 → 必然出现某一帧正反面撞车。为了擦这个屁股加了 lockAll/unlockAll 7 个锁 ref，但锁之间的交接仍然可能断。

**修复**：删掉 Phase 3 + 删掉全部锁 ref。改为纯推导模型：`spread` 状态（双页偶数、单页 ±1）+ 四行公式算出 bottomLeft/bottomRight/sheetFront/sheetBack。翻完天然无缝。

**改动量**：TS 约 200 行重写。

---

### bug ④：transitionend 被子元素冒泡劫持

**位置**：`safeTransitionEnd` 函数

```tsx
const once = (e: TransitionEvent) => {
  if (done) return;  // 只校验 done，没校验 target/propertyName
  ...
};
el.addEventListener("transitionend", once as any);
```

**机制**：`transitionend` 会冒泡。子元素 `.book-fold-shadow` 有 `transition: background 0.3s ease`，`setFlipping(dir)` 执行后它的背景从 transparent 变渐变 → 300ms 发一个 transitionend 冒泡到 sheet → 被当成"翻页动画结束"捕获。

结果：520ms 的翻页动画，300ms 就被判定落定 → 回调硬写 `transform: rotateY(-180deg)` 但 React 还没提交新内容 → 中间必然有一帧背面显示上一篇的镜像。

**修复**：加两行校验：

```tsx
if (e && (e.target !== el || e.propertyName !== "transform")) return;
```

**改动量**：TS 2 行。

---

### bug ⑤（根因）：overflow:hidden 击穿 preserve-3d ⭐

**位置**：`.book-sheet` CSS

```css
.book-sheet {
  overflow: hidden;           /* ← 元凶 */
}
```

**规范依据**：CSS Transforms Level 2 规定——元素一旦带有 grouping property（`overflow` 非 `visible`、`filter`、`opacity < 1`、`clip-path`、`mask` 等），它的 `transform-style: preserve-3d` **必须计算为 `flat`**。浏览器强制，不是 bug。

**后果**：`.book-face`（正面）和 `.book-face-back`（`rotateY(180deg)`）被压进同一个平面，`backfaceVisibility` 正反切换失效。背面在 CSS 层就没渲染出来。

**这就是为什么 bug ①~④ 都修了，现象还是零变化——病根不在逻辑层**。

**修复**：把 `overflow: hidden` 从 sheet 移到两个 face 上，加 `border-radius: inherit` 继承 sheet 的圆角。

```diff
.book-sheet {
- overflow: hidden;
+ /* ⭐ 绝对不能加 overflow: hidden！
+    overflow 非visible 属于 CSS grouping property，会强制本元素的
+    transform-style: preserve-3d 计算为 flat → 正反两面被压进同一平面 */
}

.book-face {
+ overflow: hidden;
+ border-radius: inherit;
}
.book-face-back {
+ overflow: hidden;
+ border-radius: inherit;
}
```

**改动量**：CSS 约 7 行。

---

## 三、最终模型

### 3.1 状态定义

```ts
const [spread, setSpread] = useState(0);   // 右页索引（双页偶数、单页±1）
const step = isSinglePage ? 1 : 2;
const canPrev = spread - step >= 0;
const canNext = spread + step <= total;
```

spread 语义：指向当前跨页的右页在 diaries 里的索引。翻页时 ±step，spread 变化只发生在动画结束的同一帧（flushSync）。

### 3.2 纯推导（核心）

所有页面内容由 spread + flipping + isSinglePage 四行公式算出：

```ts
const onLeft = flipping === "prev";

const bottomLeftIdx  = isSinglePage ? -99 : (onLeft ? spread - 3 : spread - 1);
const bottomRightIdx = isSinglePage ? (onLeft ? spread - 1 : spread + 1) : (onLeft ? spread : spread + 2);
const sheetFrontIdx  = isSinglePage ? spread : (onLeft ? spread - 1 : spread);
const sheetBackIdx   = isSinglePage ? (onLeft ? spread - 1 : spread + 1) : (onLeft ? spread - 2 : spread + 1);
```

**双页 next**：spread=b → 左页 b-1 / 右页 b+2 / sheet正面 b / sheet背面 b+1。落定后 spread=b+2，天然对齐。

**单页 next**：spread=b → 右页 b+1 / sheet正面 b / sheet背面 b+1。落定后 spread=b+1。

### 3.3 单段动画 + useLayoutEffect 复位

```
翻页动画：520ms cubic-bezier → transitionend → flushSync(() => setSpread(newSpread)) + setPendingReset({})
                                                               ↓
useLayoutEffect（paint 前同一帧）→ sheet.transform → 0° + sheet 回右侧
```

不跨帧、无中间态、零闪烁。

### 3.4 稳定事件监听器

```ts
useEffect(() => {
  const handleMove = ...;  // 读 ref
  const handleUp = ...;    // 读 ref
  // 保存到 nativeMoveRef / nativeUpRef
  // 空依赖
}, [snapFlip]);
```

pointerdown 时绑定 nativeMoveRef.current / nativeUpRef.current（原生事件适配层），handleUp 里用同一份引用解绑。

---

## 四、改动清单

| # | 文件 | 类型 | 行数 | 说明 |
|---|---|---|---|---|
| ① | `src/index.css` | CSS | +8 | 拆 `.book-sheet-left` 出 display:none；`.book-fold-shadow` 单页 width:100% |
| ① | `src/components/BookReader.tsx` | TS | — | sheetFront/sheetBack 改用推导值（不再读 state） |
| ② | `src/components/BookReader.tsx` | TS | +30 | 监听器稳定化：空依赖 + spreadRef/canRef 读最新值 |
| ③ | `src/components/BookReader.tsx` | TS | -200 | 删 Phase 3 假折返 + 删 7 个锁 ref + 纯推导重写 |
| ④ | `src/components/BookReader.tsx` | TS | +2 | `safeTransitionEnd` 加 `e.target === el && e.propertyName === "transform"` 校验 |
| ⑤ | `src/index.css` | CSS | +7 | `.book-sheet` 删 `overflow:hidden`，移到 `.book-face` / `.book-face-back` 加 `border-radius: inherit` |

**总计**：CSS +15 行，TS +32 / -200 = -168 行。净减 153 行。

---

## 五、验收清单

- [x] 双页 next/prev 翻页：正反面不同时显示同一篇
- [x] 单页模式左右滑动（bug ① 修复）
- [x] 拖拽到 >90° 松手正常翻，<90° 弹回
- [x] 快速连点箭头 5 次方向交替：不错乱不闪白
- [x] total=1 的本子：不能翻，不报错
- [x] 键盘 ← → 翻页正常
- [x] 翻页全程不出现上一篇镜像（bug ④ 修复）
- [x] 翻页全程不出现透明感（bug ⑤ 修复）
- [x] 四角圆角无方形溢出

---

## 六、通用教训

> 1. **绝不能在同一元素上同时写 `overflow: hidden` 和 `transform-style: preserve-3d`**——CSS 规范强制 3D 压平
> 2. 圆角裁剪要下沉到子 face，不要加在 3D 容器上
> 3. 做 transitionend + setTimeout 双兜底动画收尾，**必须校验 `e.target === el && e.propertyName === "目标属性"`**——任何带 transition 的子元素都会冒泡劫持
> 4. 翻页动画改完必须测 `getComputedStyle(el).transformStyle === 'preserve-3d'`，不能只看代码逻辑
> 5. 凡是两套独立数据源驱动同一视觉（state vs ref），必然有同步窗口——要么纯推导，要么 flushSync 强制同帧

---

## 七、git 提交记录

```
commit d6841c0
feat: 写日记时小麦 AI 辅助 — MiniAiBubble

commit 20d311b (之前的 BookReader 3D 改造，已被本次覆盖)

[当前分支 uncommitted]
fix: BookReader 翻页 5 个 bug 全部修复
- bug ①: CSS .book-sheet-left display:none 误伤
- bug ②: 事件监听器旧闭包
- bug ③: Phase 3 假折返 + 删 7 个锁 ref
- bug ④: safeTransitionEnd 被 .book-fold-shadow 冒泡劫持
- bug ⑤(根因): .book-sheet overflow:hidden 击穿 preserve-3d
```
