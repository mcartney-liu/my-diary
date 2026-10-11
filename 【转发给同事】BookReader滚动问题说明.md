# 【转发给 Web 同事】BookReader 长日记仍无法滚动 —— 第二轮（真凶在事件监听层）

来源：安卓真机复测（已按你的建议加了 `min-h-0`，**依然滑不动**）
核查时间：2026-10-10
结论：**`min-h-0` 加对了，但真凶是 `touchmove` 监听器挂在了 `window` 上。**

---

## 一、先确认：你已改对的部分

| 你的改动 | 状态 |
|---|---|
| `PageContent` 外层加 `min-h-0`（149 行） | ✅ 正确 |
| 滚动容器加 `min-h-0`（160 行） | ✅ 正确 |
| `touchAction: 'pan-y'` + `WebkitOverflowScrolling: 'touch'` | ✅ 正确 |
| `onNativeTouchMove` 改成"仅横向才preventDefault" | ✅ 方向正确 |
| `onMouseDown` 用 `sourceCapabilities` 拦合成事件 | ✅ 正确 |
| `onTouchStart` 未加 preventDefault | ✅ 干净，没污染 |

**CSS 链路我也逐项核实过，全部正确**：

```
.book-container      touch-action: pan-y     ✅
.book-page-left      overflow-y: auto       ✅
.book-page-right     overflow-y: auto       ✅（你新加的）
.book-page-face      touch-action: pan-y     ✅
.book-page           position:absolute; top:0; bottom:0  → 高度确定 ✅
```

**所以高度约束这一层你已经修好了。** 问题在别处。

---

## 二、真凶：`touchmove` 监听器挂在 `window` 上

### 当前位置：`BookReader.tsx:552`

```ts
if (nativeTouchMove) {
  window.addEventListener("touchmove", nativeTouchMove, { passive: false });
}
```

### 为什么这样就滚不动

这是移动端触摸事件模型的关键机制：

**① `touchmove` 冒泡到 `window` 时，滚动已经"启动过"了**

手指按下（`touchstart`）→ 浏览器判定可能滚动 → 把内容跟着手指动 → 这时事件才冒泡到 `window`。

**② `passive: false` 让浏览器必须等 JS 说完话**

`passive: false` 的意思是"这个监听器可能会 preventDefault，浏览器你**不许自作主张**滚动，要等我调完 `preventDefault` 才知道能不能滚"。

于是每个 `touchmove` 事件，浏览器都要**同步等** JS 回调执行完 —— 你在 `BookReader.tsx:410` 里的判断：

```ts
if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
  e.preventDefault();
}
```

**③ 手指刚开始移动时位移很小，`deltaX` 与 `deltaY` 都不足6px**

```
第一次 touchmove：deltaX=2, deltaY=4  → 条件不成立 → 不preventDefault
第二次：deltaX=5, deltaY=9            → 条件不成立 → 不 preventDefault
第三次：deltaX=8, deltaY=13           → 横向条件成立 → preventDefault ❌
                                        ↑ 此时滚动已经被冻结
```

**纵向滑动的前几次事件虽然放行了，但浏览器已经在等 JS；一旦某次命中了 preventDefault，滚动立即冻结**，用户感知就是"滑不动"。

**④ 更根本的问题：拖动区域是整个 `.book-container`，不是滚动容器**

用户在书页上任何位置按下（包括正文区域），都会触发这套翻页手势逻辑。**滚动容器自己的手势被外层的翻页逻辑"抢"了。**

---

## 三、修复方案

### 方案 A（推荐）· 判断改成"锁定方向"，而不是"每次都判断"

核心思路：**手势方向在第一次有效移动时就锁定**，之后不再反复判断，也不再反复决定 preventDefault。

**文件：`src/components/BookReader.tsx`**

**① 给 dragRef 加一个方向锁定字段**

`dragRef.current` 的类型声明处（约 380-400 行），加入 `axis: 'none' | 'x' | 'y'`

**② `onPointerDown` 里初始化 `axis: 'none'`**

**③ 替换 `onNativeTouchMove` 整个函数（约 405-420 行）**

```ts
const onNativeTouchMove = (e: TouchEvent) => {
  const t = e.touches[0];
  if (!t) return;
  const s = dragRef.current;
  const deltaX = t.clientX - s.startX;
  const deltaY = t.clientY - s.startY;

  // ⭐ 手势方向只锁定一次：首次超过阈值时判定，之后不再改
  if (s.axis === 'none') {
    const adx = Math.abs(deltaX);
    const ady = Math.abs(deltaY);
    if (Math.max(adx, ady) < 8) return;      // 太小，等下一次
    s.axis = adx > ady ? 'x' : 'y';
  }

  // 纵向 → 绝不 preventDefault，把滚动完全交还浏览器
  if (s.axis === 'y') return;

  // 横向 → 翻页
  e.preventDefault();
  handleMove(t.clientX, t.clientY);
};
```

**关键变化**：

| | 现在 | 改后 |
|---|---|---|
| 方向判断 | 每次 touchmove 都重算 | 只在第一次锁定，之后不再改 |
| 纵向分支 | "看起来不 preventDefault"，但浏览器仍在等 | `return` 明确放弃，浏览器立刻滚 |
| preventDefault | 可能被某次误命中冻结滚动 | 纵向锁死后**永不触发** |

---

### 方案 B（更彻底）· 监听器从 `window` 挪到滚动容器

如果方案 A 改完还偶发异常，做这个加固：

**把 `touchmove` 监听从 `window` 改成 `containerRef.current`**

```ts
const target = containerRef.current;
if (target && nativeTouchMove) {
  target.addEventListener("touchmove", nativeTouchMove, { passive: false });
}
```

并在 `nativeUp`（约 570 行）里对应改成 `target.removeEventListener(...)`。

**理由**：绑定在滚动容器上，浏览器**在到达该容器之前就已经完成原生滚动的决策**，JS 只是容器内的事，不会影响手势启动。

**注意**：`nativeUp` 里同时解绑了 `mousemove`/`mouseup`/`touchend`/`touchmove` 四个，要一起改，只挪 touchmove 会造成解绑不匹配。

---

## 四、验收清单

请在**真机手机竖屏**下逐条确认（浏览器 DevTools 无法复现，必须真机）：

- [ ] 写一篇 20+ 段的超长日记
- [ ] 打开书架进入该篇，**上下滑动**能滚到末尾
- [ ] 能看到末尾的 `No. XX` 与「编辑 →」
- [ ] 正文中间某个位置**横向拖动**仍能翻页
- [ ] 滚动过程中**不会误触发翻页**
- [ ] 短日记（1-2 段）显示正常
- [ ] 桌面端回归一次
- [ ] **翻到最后一篇之后能继续翻到底页**（这是安卓端另一个现象，若方向锁定后仍翻不过去，请告诉我）

## 五、快速自查手段

在真机 Chrome 里打开调试，或用远程调试，Console 执行：

```js
// 找出真正该滚的元素，以及它到底有没有滚动
[...document.querySelectorAll('.book-page *')]
  .filter(e => e.scrollHeight > e.clientHeight)
  .map(e => ({
    cls: e.className.slice(0, 60),
    scrollH: e.scrollHeight,
    clientH: e.clientHeight,
    canScroll: getComputedStyle(e).overflowY
  }))
```

如果这条命令**返回空数组**，说明"内容确实超出但没有元素可滚" → 是高度约束问题；
如果返回对象但 `canScroll` 不是 `auto` → 是 overflow 被覆盖；
如果都正常但仍滑不动 → 就是事件层问题，走方案 A + B。

---

## 六、附：安卓端另一个现象（供你一起验证）

安卓真机反馈：**翻到最后一篇之后翻不动，看不到底页**。

我核查了边界判断（`BookReader.tsx:245`）：

```ts
const canNext = spread + step <= total;
```

- 双页模式（PC，step=2）：封底自动显示在最后一篇的右半页，**不需要再翻**，所以 PC 正常
- 单页模式（手机，step=1）：**必须再翻一次**才能显示封底 —— 而这次翻页正好被上面那个 `touchmove` 拦截逻辑挡住

**推测：修好手势层后，这个现象会一起消失。** 请一并验证。若仍存在，告诉我日记总数，我再算 `canNext` 的边界（有个 off-by-one 的嫌疑点，但我想先确认是不是被手势问题掩盖了）。

---

**总结：`min-h-0` 已正确；真凶是 `window` 上 `passive:false` 的 touchmove 反复判断。建议先做方案 A（方向锁定），必要时叠加方案 B（监听下移到容器）。**