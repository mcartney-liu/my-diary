import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onChange: (content: string) => void;
  onRemove: () => void;
}

export default function TextBlock({ block, onChange, onRemove }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resize = () => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  // 内容变化时防抖重算 — 绝不打断 iOS 输入
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(resize, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [block.content]);

  // 首次渲染 + 窗口变化时算一次
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    // 等 layout 完成
    const raf = requestAnimationFrame(resize);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const empty = block.content.length === 0;

  return (
    <div className="group relative">
      <textarea
        ref={ref}
        value={block.content}
        onChange={(e) => onChange(e.target.value)}
        onBlur={resize}
        placeholder={empty ? "在此书写..." : ""}
        className={`w-full resize-none bg-transparent outline-none text-[17px] leading-8 font-hand text-paper-ink placeholder:text-paper-ink2/50 ${
          empty ? "min-h-[96px] py-1" : ""
        }`}
        style={{ minHeight: empty ? 96 : undefined, WebkitUserSelect: "text", touchAction: "manipulation" }}
      />
      {!empty && (
        <button
          onClick={onRemove}
          className="absolute -right-2 top-2 opacity-0 group-hover:opacity-100 transition p-1 rounded-full hover:bg-paper-line"
          title="删除此块"
        >
          <X size={14} className="text-paper-ink2" />
        </button>
      )}
    </div>
  );
}
