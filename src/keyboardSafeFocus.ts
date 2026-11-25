// 键盘遮挡修正（全局，只监听不改业务）
//
// 问题：手机上点输入框 → 软键盘弹起 → 页面可视区被压掉一半，
// 底部那些输入框（写日记、AI 对话、知识库搜索）就藏在键盘下面，看不见自己打的字。
//
// 做法：聚焦时先等键盘弹出动画结束，再量一次输入框是否真的掉到可视区外；
//     只有真被遮住才滚，没被遮住就完全不动 —— 避免"每点一次输入框页面就跳一下"。
//
// 为什么延迟 260ms：iOS / Android 键盘动画约 200~300ms，立刻量到的还是键盘弹起前的高度，
// 会误判成"没被遮住"。这一层只是补一刀兜底，系统级 adjustResize 仍然优先生效。

const KEYBOARD_SETTLE_MS = 260;
/** 距可视区底边留的余量，避免输入框正好贴着键盘顶边 */
const SAFE_GAP = 24;

function isTextField(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  // 这些类型不弹键盘，没必要滚
  return type !== "checkbox" && type !== "radio" && type !== "file" && type !== "button" && type !== "submit";
}

export function installKeyboardSafeFocus(): void {
  if (typeof document === "undefined") return;

  const onFocusIn = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (!el || !isTextField(el)) return;
    // 标记「键盘可能弹起」：小麦页等整页布局据此隐藏浮动底栏，避免盖住输入框
    document.documentElement.classList.add("kb-open");

    window.setTimeout(() => {
      if (!el.isConnected) return; // 聚焦后又立刻关了弹窗

      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const rect = el.getBoundingClientRect();

      if (rect.bottom <= visibleBottom - SAFE_GAP) return; // 没被遮住，不动
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, KEYBOARD_SETTLE_MS);
  };

  // 捕获阶段监听：弹窗里的输入框焦点事件在 React 挂载时就已冒泡，捕获能确保都收到
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !isTextField(el)) return;
    // 稍等一下：焦点从一个输入框直接跳到另一个时，不要让底栏闪一下
    window.setTimeout(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || !isTextField(a)) document.documentElement.classList.remove("kb-open");
    }, 120);
  }, true);
}
