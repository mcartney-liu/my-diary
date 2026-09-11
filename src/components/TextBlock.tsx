import { useEffect, useRef } from "react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onChange: (content: string) => void;
  onEnter?: () => void;
}

export default function TextBlock({ block, onChange, onEnter }: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [block.content]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && onEnter) {
      // 在空行回车 → 创建新块
      if (block.content === "" || block.content.endsWith("\n")) {
        e.preventDefault();
        onEnter();
      }
    }
  };

  return (
    <textarea
      ref={taRef}
      value={block.content}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      placeholder="今天发生了什么..."
      rows={1}
      className={[
        "w-full resize-none bg-transparent border-0 outline-none",
        "text-paper-ink placeholder:text-paper-ink3/80",
        "text-[15px] md:text-base leading-[1.8]",
        "py-1 md:py-2",
      ].join(" ")}
      style={{ minHeight: "44px" }}
    />
  );
}
