/**
 * 页内弹窗「关闭栈」
 * ================================================================
 * 目的：安卓硬件返回键按下去时，**先关弹窗**，而不是直接翻页/退出 App。
 *
 * 用法（弹窗组件内部）：
 *   useEffect(() => {
 *     if (!open) return;
 *     return registerModalClose(onCancel);   // 返回键命中时执行 onCancel
 *   }, [open, onCancel]);
 *
 * 为什么不用 DOM 探测：
 *   弹窗都是 createPortal 渲染，且没有统一的标记属性；靠栈登记最可靠。
 */

type Closer = () => void;

const stack: Closer[] = [];

/** 登记一个「关闭当前弹窗」的回调，返回注销函数（useEffect 清理用）。 */
export function registerModalClose(closer: Closer): () => void {
  stack.push(closer);
  return () => {
    const i = stack.lastIndexOf(closer);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * 关掉最上层的弹窗。
 * @returns true = 确实有关掉了弹窗（调用方不要再翻页）；false = 当前没有弹窗
 */
export function closeTopModal(): boolean {
  const closer = stack[stack.length - 1];
  if (!closer) return false;
  try {
    closer();
  } catch {
    /* 关闭回调出错不应阻断返回键流程 */
  }
  return true;
}

/** 当前是否有弹窗开着（测试/调试用）。 */
export function hasOpenModal(): boolean {
  return stack.length > 0;
}
