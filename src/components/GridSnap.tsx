import { useEffect, useRef } from "react";

/**
 * GridSnap — 让子块的底部自动对齐到笔记本网格线
 *
 * 用法：把图片/音频块包在 <GridSnap> 里，它会在 onMount / 内容变化时
 * 测量自身高度，然后给 margin-bottom 补齐到下一条 32px 网格线。
 *
 * 核心原理：notebook 每 32px 一条线，文字行高也是 32px。
 * 如果一个图片总高 196px（6.125 行），底部 margin 补 4px → 200px（6.25 行）
 * 还是没对齐… 正确做法是补到 **刚好超过** 到下一条线：
 *   remainder = height % 32
 *   pad = remainder === 0 ? 0 : 32 - remainder
 */
const ROW_H = 32;

interface Props {
  children: React.ReactNode;
  /** 额外要预留的行数（比如图片想至少占 N 行） */
  minRows?: number;
}

export default function GridSnap({ children, minRows = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const snap = () => {
      const h = el.scrollHeight;
      let target = h;
      if (minRows > 0) {
        target = Math.max(target, minRows * ROW_H);
      }
      const remainder = target % ROW_H;
      const pad = remainder === 0 ? 0 : ROW_H - remainder;
      el.style.marginBottom = `${pad}px`;
    };

    // 初次 + 子元素（图片）加载完都触发
    snap();
    const imgs = el.querySelectorAll("img");
    imgs.forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", snap, { once: true });
      }
    });

    // ResizeObserver 兜底（音频播放器尺寸变化等）
    const ro = new ResizeObserver(snap);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minRows, children]);

  return (
    <div ref={ref} className="grid-snap">
      {children}
    </div>
  );
}
