import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onRemove: () => void;
}

export default function ImageBlock({ block, onRemove }: Props) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <div className="group relative">
        <div className="rounded-2xl overflow-hidden bg-paper-surface border border-paper-line">
          <img
            src={block.content}
            alt=""
            className="w-full max-h-[420px] object-contain cursor-pointer"
            onClick={() => setPreview(true)}
          />
        </div>
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
            className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white"
            title="删除"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(false)}
        >
          <img src={block.content} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button
            onClick={() => setPreview(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </>
  );
}
