# UI 交互规范 — 弹窗（Modal & ConfirmDialog）

> 统一项目内所有弹窗的视觉语言和交互行为，新建弹窗必须遵循。

---

## 一、核心组件

| 组件 | 文件 | 用途 |
|------|------|------|
| **Modal** | `src/components/Modal.tsx` | 通用弹窗基类，只管「遮罩 + 动画 + 卡片容器」，内容由 children 传入 |
| **ConfirmDialog** | `src/components/ConfirmDialog.tsx` | 确认对话框，Modal 的特化版本，内置标题 + 消息 + 双按钮 |

**规则**：**禁止**手写 `<div className="fixed inset-0 ... bg-black/40 ...">` 弹窗。一律用 `<Modal>` 或 `<ConfirmDialog>`。

---

## 二、Modal 用法

```tsx
import Modal from "./Modal";

<Modal
  open={showDialog}
  onClose={() => setShowDialog(false)}
  title="📝 新建知识库"        // 可选，传了就自动渲染 header + × 按钮
  size="sm"                    // sm | md | lg | xl，默认 md
  scrollable={false}           // 大弹窗内容多时开 true，会内部滚动
  closeOnMask={true}           // 点遮罩是否关闭，默认 true；loading/seed 中可设 false
  showClose={true}             // 右上角 × 按钮，默认 true
>
  {/* 内容随便写 */}
  <div className="p-5">
    <input ... />
    <button onClick={handleSave}>确定</button>
  </div>
</Modal>
```

### size 对应宽度

| size | max-w | 场景 |
|------|-------|------|
| sm | max-w-sm (384px) | 新建知识库、简单表单 |
| md | max-w-md (448px) | 预设选择、资料录入 |
| lg | max-w-2xl (672px) | 配置面板、富内容 |
| xl | max-w-4xl (896px) | 极少数大场景，谨慎用 |

---

## 三、ConfirmDialog 用法

```tsx
import ConfirmDialog from "./ConfirmDialog";

// 在组件 state 里维护一个 confirm 对象
const [confirm, setConfirm] = useState<{
  open: boolean; title: string; message: string;
  confirmText?: string; cancelText?: string;
  confirmTone?: "default" | "danger";
  onConfirm: () => void;
}>({ open: false, title: "", message: "", onConfirm: () => {} });

// 触发
setConfirm({
  open: true,
  title: "删除知识库",
  message: `确定删除「${kb.title}」？所有相关数据都会消失！`,
  confirmText: "删除",
  confirmTone: "danger",       // 红色按钮表示破坏性操作
  onConfirm: async () => {
    await wikiDeleteKb(kb.id);
    setConfirm(c => ({ ...c, open: false }));
  },
});

// JSX 里
<ConfirmDialog
  open={confirm.open}
  title={confirm.title}
  message={confirm.message}
  confirmText={confirm.confirmText}
  confirmTone={confirm.confirmTone}
  onConfirm={confirm.onConfirm}
  onCancel={() => setConfirm(c => ({ ...c, open: false }))}
/>
```

**规则**：
- **破坏性操作**（删除、不可恢复）→ `confirmTone="danger"`，按钮红色
- **常规确认** → 默认 `confirmTone="default"`，按钮主题色 `bg-paper-accent`
- 异步操作在 `onConfirm` 里自己处理 loading，按钮禁用由调用方控制

---

## 四、视觉规范

| 属性 | 值 | 说明 |
|------|----|----|
| 遮罩 | `bg-black/40 backdrop-blur-sm` | 40% 黑 + 毛玻璃 |
| 遮罩动画 | `animate-[fade-in_0.15s]` | 淡入 150ms |
| 卡片动画 | `animate-[drawer-up_0.22s_ease-out]` | 从下滑入 220ms |
| 卡片圆角 | `rounded-2xl` | 统一大圆角 |
| 卡片背景 | `bg-paper-card shadow-2xl` | 信纸卡片 + 双层阴影 |
| 卡片边框 | 无（shadow 足够） | 不需要额外 border |
| Header 底线 | `border-b border-paper-line/60` | 半透明分隔 |
| 层级 | `z-50` | 页面最高层，避免被其他 fixed 遮挡 |

---

## 五、交互规范

| 行为 | 规则 |
|------|------|
| **点击遮罩关闭** | 默认开启；loading / seed 中关闭（`closeOnMask={false}`） |
| **Esc 关闭** | 暂未实现，待后续统一加全局 keydown listener |
| **滚动锁定** | Modal 内部 `overflow-hidden`，外层 body 不滚动 |
| **键盘焦点** | 打开后自动聚焦第一个 input（`autoFocus`） |
| **打开时机** | 内容 fetching 时不弹，等数据齐了再 open |
| **关闭清理** | `onClose` 里清 state（如 `setNewKbName("")`），不要散落在各处 |

---

## 六、命名与放置

| 规则 | 说明 |
|------|------|
| 弹窗 state | 布尔变量 `showXxx` / `xxxDialog`，或对象 `{ open: true, ...payload }` |
| 组件文件 | 放在 `src/components/` 下，和页面组件同级 |
| 组件放置 | 父组件 return 末尾、`</>` 或 `</section>` 之前渲染，避免被层级截断 |

---

## 七、已改造的弹窗清单

| 位置 | 场景 | 组件 | 状态 |
|------|------|------|------|
| KnowledgeBase 主组件 | 新建知识库 | `Modal` | ✅ |
| KnowledgeBase 主组件 | 配置知识库 | `Modal` | ✅ |
| KnowledgeBase 主组件 | 官方预设选择 | `Modal` | ✅ |
| KnowledgeBase 主组件 | 汇入预检（low/medium） | `ConfirmDialog` | ✅ |
| KnowledgeBase 主组件 | 删除知识库 | `ConfirmDialog` | ✅ |
| SettingsTab | 新建知识库（×2） | `Modal` | ✅ |
| SettingsTab | 删除分类 | `ConfirmDialog` | ✅ |
| CalendarPage | 底部导航 avatar | （非弹窗） | ✅ |
| PageDetailModal | 页面详情 | 独立组件 | 已存在，待评估是否用 Modal |

---

## 八、待办（后续迭代）

- [ ] Modal 加 Esc 键关闭
- [ ] Modal 加 body scroll lock（`document.body.style.overflow = 'hidden'`）
- [ ] Modal 加首次打开的 autofocus trap（防止 Tab 跳出弹窗）
- [ ] 扫全项目剩余 `alert()` 和原生 `confirm()`，全部替换
- [ ] 考虑 Toast 也抽成独立组件（现在还是内联 `fixed bottom-8`）
