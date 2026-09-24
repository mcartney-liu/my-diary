import { useState, useRef, useEffect, useCallback } from "react";
import { X, ZoomIn } from "lucide-react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onRemove: () => void;
  onUpdate?: (patch: Partial<DiaryBlock>) => void;
}

const MIN_W = 25;
const MAX_W = 150;

export default function ImageBlock({ block, onRemove, onUpdate }: Props) {
  const [preview, setPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(100);
  const [dragW, setDragW] = useState<number | null>(null); // 拖动时实时显示的宽度

  const width = dragW ?? block.widthPercent ?? 100;

  const onHandleDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    startXRef.current = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    startWRef.current = block.widthPercent ?? 100;
  };

  const onMove = useCallback((clientX: number) => {
    if (!draggingRef.current || !containerRef.current) return;
    const deltaX = clientX - startXRef.current;
    const containerWidth = containerRef.current.offsetWidth; // 容器 100% 对应的像素宽
    const deltaPercent = (deltaX / containerWidth) * 100;
    const next = Math.max(MIN_W, Math.min(MAX_W, startWRef.current + deltaPercent));
    setDragW(Math.round(next));
  }, []);

  const onUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragW !== null && onUpdate) {
      onUpdate({ widthPercent: dragW });
    }
    setDragW(null);
  }, [dragW, onUpdate]);

  // 全局事件监听 —— 拖动中才绑定
  useEffect(() => {
    if (!draggingRef.current) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const x = "touches" in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      if (x !== undefined) onMove(x);
    };
    const handleUp = () => onUp();
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [onMove, onUp]);

  return (
    <>
      <div ref={containerRef} className="group relative flex justify-start">
        <div
          className={`rounded-2xl overflow-hidden bg-paper-surface border border-paper-line relative ${draggingRef.current ? "pointer-events-none" : ""}`}
          style={{ width: `${width}%`, maxWidth: "100%" }}
        >
          <img
            src={block.content}
            alt=""
            className="w-full max-h-[420px] object-contain cursor-pointer block select-none"
            onClick={() => !draggingRef.current && setPreview(true)}
            draggable={false}
          />

          {/* 右下角拖拽手柄 — 只有编辑态显示（有 onUpdate），hover 才可见 */}
          {onUpdate && (
            <div
              onMouseDown={onHandleDown}
              onTouchStart={onHandleDown}
              className="absolute -bottom-1 -right-1 w-5 h-5 flex items-center justify-center cursor-nesw-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
              title="拖动调整大小"
            >
              <div className="w-3 h-3 bg-paper-ink/60 rounded-full border-2 border-white shadow-md hover:bg-paper-accent transition-colors" />
            </div>
          )}
        </div>

        {/* 悬浮工具栏 — 右上角 */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={() => setPreview(true)}
            className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white"
            title="查看大图"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-full bg-black/60 hover:bg-red-500 text-white"
            title="删除"
          >
            <X size={14} />
          </button>
        </div>

        {/* 拖动时的实时百分比提示 */}
        {draggingRef.current && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-paper-ink text-white text-xs font-medium pointer-events-none">
            {Math.round(width)}%
          </div>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(false)}
        >
          <img src={block.content} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button
            onClick={() => setPreview(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-paper-card/10 hover:bg-paper-card/20 text-white"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </>
  );
}
