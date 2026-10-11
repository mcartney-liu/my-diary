# 【转发给 Web 同事】双页模式下「奇数篇日记看不到封底」—— 根因与修法

来源：安卓端真机 + PC 浏览器双向验证
核查时间：2026-10-10
现象（翔哥实测确认）：

| 场景 | 现象 |
|---|---|
| 手机浏览器（单页模式） | ✅ 能翻到最后一页，THE END 正常显示 |
| PC 浏览器（双页模式），日记**偶数**篇 | ✅ 能翻到底，能看到 THE END |
| PC 浏览器（双页模式），日记**奇数**篇 | ❌ **翻不到 THE END** |

---

## 一、根因：双页模式的左页永远渲染「书皮」，从不渲染「封底」

### 代码位置：`BookReader.tsx:640-652`

```tsx
{/* 底层左页（封面 / 上一篇） */}
{!isSinglePage && (
  <div className="book-page book-page-left" ...>
    {bottomLeft ? (
      <><PageContent diary={bottomLeft} ... /><PaperTexture /></>
    ) : (
      <CoverPage title={bookTitle} ... />      {/* 🔴 只有书皮，没有封底分支 */}
    )}
  </div>
)}

{/* 底层右页（下一篇 / 封底） */}
<div className="book-page book-page-right" ...>
  {bottomRight ? (
    <><PageContent diary={bottomRight} ... /><PaperTexture /></>
  ) : (
    <BackCoverPage theme={bookTheme} />       {/* ✅ 右页有封底分支 */}
  )}
</div>
```

**左页的 `else` 分支写死了 `<CoverPage>`（书皮）**，没有「封底」的可能。

### 为什么恰好是奇数篇出问题

双页模式 `step=2`，最后一屏停在 `spread =2k`（偶数）：

| 日记篇数 | 最后一屏 spread | 左页索引 `spread-1` | 右页索引 `spread+2` | 显示结果 |
|---|---|---|---|---|
| **2 篇** | 2 | 1（有） | 3 → **越界** | 右页=封底 ✅ |
| **3 篇** | 2 | 1（有） | 3（有，索引2） | 🔴 **左右都有内容，永远到不了越界** |
| **4 篇** | 4 | 3（有） | 5 → **越界** | 右页=封底 ✅ |
| **5 篇** | 4 | 3（有） | 5（有，索引4） | 🔴 **同上** |

**规律**：

- `total` 为**偶数** → 最后一屏的右页索引 `spread+2 == total` → 越界 → **右页渲染封底 ✅**
- `total` 为**奇数** → 最后一屏的右页索引 `spread+2 <= total-1` → **没越界**；再翻页又被 `canNext = spread + step <= total` 拦住 → **永远看不到封底 ❌**

### 我已验证 `canNext` 本身没有 off-by-one

用真实代码逻辑（`spread` 每次 `+= step`，`canNext: spread + step <= total`）跑了 1-8 篇：

```
1 篇: 最后spread=0  右页1=封底 ✅
2 篇: 最后spread=2  右页3=封底 ✅
3 篇: 最后spread=2  右页3有内容 ❌   ← 与你的现象一致
4 篇: 最后spread=4  右页5=封底 ✅
5 篇: 最后spread=4  右页5有内容 ❌
6 篇: 最后spread=6  右页7=封底 ✅
```

**所以边界判断不用改，问题纯粹在渲染分支。** 修法只需一处。

---

## 二、修复方案

### 文件：`src/components/BookReader.tsx` 第 650行附近

把左页的 `else` 分支从「只给书皮」改成「书皮或封底」。

**改前**
```tsx
{!isSinglePage && (
  <div className="book-page book-page-left" style={{ background: bookTheme.pageBg }}>
    {bottomLeft ? (
      <>
        <PageContent diary={bottomLeft} pageNumber={bottomLeftNum} onEdit={onEdit} />
        <PaperTexture />
      </>
    ) : (
      <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
    )}
  </div>
)}
```

**改后**
```tsx
{!isSinglePage && (
  <div className="book-page book-page-left" style={{ background: bookTheme.pageBg }}>
    {bottomLeft ? (
      <>
        <PageContent diary={bottomLeft} pageNumber={bottomLeftNum} onEdit={onEdit} />
        <PaperTexture />
      </>
    ) : bottomLeftIdx >= 0 ? (
      /* 🔴 索引越界 → 说明已翻过最后一篇，这是封底 */
      <BackCoverPage theme={bookTheme} />
    ) : (
      /* 索引 < 0 → 还在书皮范围 */
      <CoverPage title={bookTitle} icon={bookIcon} theme={bookTheme} diaries={diaries} />
    )}
  </div>
)}
```

### 为什么加 `bottomLeftIdx >= 0` 这个判断

`bottomLeftIdx` 有三种取值（见 297 行）：

| `bottomLeftIdx` | 含义 | 该显示 |
|---|---|---|
| `spread - 1` 或 `spread - 3`，结果 `>= 0` 且 `< total` | 正常的上一篇 | `PageContent` |
| `>= total` | **已翻过最后一篇** | **封底 `BackCoverPage`** |
| `< 0` | 还没到书皮之前 |书皮 `CoverPage` |

**注意不能只判 `bottomLeft` 是否为 null**——因为它为 null 时同时包含「越界」和「负数」两种，必须用索引区分。

---

## 三、Sheet 层的同类问题（请一并检查）

`book-sheet` 的正反面也有分支判断，odd 数篇时翻页动画可能也会露出空页：

```tsx
{sheetFront ? (...) : sheetFrontIdx < 0
  ? <CoverPage ... />
  : <BackCoverPage theme={bookTheme} />}          {/* 行681附近 */
```

`sheetBack`（行 700 附近）：

```tsx
{sheetBack ? (...) : sheetBackIdx < 0
  ? <CoverPage ... />
  : sheetBackIdx >= total
    ? <BackCoverPage theme={bookTheme} />
    : null}                                      {/* 🔴 这里落到 null → 空白！*/
```

**请核对 `sheetBackIdx` 既非 `<0` 也非 `>=total`、但 `sheetBack` 仍为 null 的情况是否存在**——那说明有第四种状态没处理，会渲染出空白页（很可能就是翔哥最初说的"翻过去那边没有东西"）。

---

## 四、验收清单

请务必**分别用奇数篇和偶数篇各测一次**，双页模式（PC 横屏）：

- [ ] **1 篇**日记 → 翻到底，看到 THE END
- [ ] **2 篇** → 同上
- [ ] **3 篇** → 同上（这条是本次修复的关键用例）
- [ ] **4 篇** → 同上
- [ ] **5 篇** → 同上
- [ ] **7 篇** → 同上
- [ ] 翻页动画过程中没有空白页（检查 sheet 正反面）
- [ ] 封底出现后还能翻回来（往回翻能看到最后一篇）
- [ ] 单页模式（手机竖屏 / 窗口 < 768px）回归一次
- [ ] 封面（书皮）仍然正常，不能被改成封底

---

## 五、自查命令

想确认某个状态下左/右页显示什么，在 Console 执行：

```js
// 手动推进 spread 看最后一屏
// （把 N 改成日记总篇数，逐个试奇偶）
const N = 3, step = 2;
let spread = 0;
while (spread + step <= N) spread += step;
console.log('最后一屏 spread =', spread);
console.log('左页 idx =', spread - 1, N, '→', (spread-1) < N ? `第${spread}篇` : '封底');
console.log('右页 idx =', spread + 1, N, '→', (spread+1) < N ? `第${spread+2}篇` : '封底');
```

---

**总结：边界判断 `canNext` 没问题，根因是左页的 `else` 只渲染 `CoverPage`、没有封底分支。改一处判断即可：`bottomLeftIdx >= 0 ? BackCoverPage : CoverPage`。**

**另外请检查 sheet 层是否有落到 `null` 的第四种状态**（行 700 附近），那可能对应"翻过去是空白"的现象。