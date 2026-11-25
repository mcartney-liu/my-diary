import type { ReactNode } from "react";
import Xiaomai, { type XiaomaiMood } from "./Xiaomai";

// 空页面：小麦 + 一句话 + 一个行动按钮（替代原来的一行灰字）
export default function EmptyState({ mood = "happy", title, hint, action }: {
  mood?: XiaomaiMood; title: ReactNode; hint?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-2 animate-pop-in">
      <Xiaomai mood={mood} size={84} />
      <div className="mt-1 text-sm font-medium text-paper-ink">{title}</div>
      {hint && <div className="text-xs text-paper-ink2 max-w-[16rem]">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
