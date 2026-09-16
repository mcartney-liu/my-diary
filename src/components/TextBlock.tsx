import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onChange: (content: string) => void;
  onRemove: () => void;
  extraClass?: string;
  onTextareaRef?: (el: HTMLTextAreaElement | null) => void;
}

export default function TextBlock({ block, onChange, onRemove, extraClass = "", onTextareaRef }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // iOS 中文输入法 composition 状态：true = 正在输入拼音候选，不要 setState
  const composingRef = useRef(false);
  // 本地缓冲：composition 期间存这里，不触发上层
  const [localValue, setLocalValue] = useState(block.content);

  const resize = () => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  // 内容变化时防抖重算高度
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(resize, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [block.content]);

  // 外部 content 变化（比如 undo 或其他模块更新）时同步本地
  useEffect(() => {
    if (!composingRef.current) setLocalValue(block.content);
  }, [block.content]);

  // 首次渲染 + 窗口变化时算一次高度
  useEffect(() => {
    const raf = requestAnimationFrame(resize);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    // composition 期间只更新本地 state，不往上层传
    if (!composingRef.current) onChange(v);
  };

  const handleCompositionStart = () => {
    composingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    // composition 结束，用最终值通知上层
    const v = (e.target as HTMLTextAreaElement).value;
    setLocalValue(v);
    onChange(v);
    // iOS 上 compositionend 触发后需要再 resize 一次
    setTimeout(resize, 10);
  };

  const empty = localValue.length === 0;

  return (
    <div className="group relative">
      <textarea
        ref={(el) => {
          ref.current = el;
          onTextareaRef?.(el);
        }}
        value={localValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBlur={resize}
        placeholder={empty ? "在此书写..." : ""}
        className={`w-full resize-none bg-transparent outline-none text-[17px] leading-8 [font-family:var(--app-editor-font)] text-paper-ink placeholder:text-paper-ink2/50 ${
          empty ? "min-h-[96px] py-1" : ""
        } ${extraClass}`}
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
