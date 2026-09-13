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

  // 自动调整高度
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [block.content]);

  const empty = block.content.length === 0;

  return (
    <div className="group relative">
      <textarea
        ref={ref}
        value={block.content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={empty ? "在此书写..." : ""}
        rows={empty ? 3 : 1}
        className={`w-full resize-none bg-transparent outline-none text-[17px] leading-8 font-hand text-paper-ink placeholder:text-paper-ink2/50 ${
          empty ? "min-h-[120px] py-2" : ""
        }`}
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
