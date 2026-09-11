import { useRef, useState } from "react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onChange: (content: string) => void;
}

export default function ImageBlock({ block, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(f);
  };

  if (!block.content) {
    // 空占位
    return (
      <div className="img-block py-3">
        <div
          onClick={pick}
          className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-paper-line rounded-xl text-paper-ink2 cursor-pointer hover:border-paper-accent hover:text-paper-accent transition-colors"
        >
          <span className="text-3xl">🖼️</span>
          <span className="text-sm">点击选择图片</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="img-block py-2 relative group">
      <img
        src={block.content}
        alt=""
        onClick={() => setPreview(true)}
        className="w-full max-h-[500px] object-contain cursor-zoom-in rounded-xl"
      />
      <button
        onClick={pick}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-paper-bg/90 backdrop-blur-sm text-paper-ink text-xs px-2 py-1 rounded-lg shadow-soft hover:bg-paper-bg transition-opacity"
      >
        更换
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {/* 预览弹窗 */}
      {preview && (
        <div
          className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center animate-fade-in p-4"
          onClick={() => setPreview(false)}
        >
          <img src={block.content} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl w-10 h-10 rounded-full hover:bg-white/10">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
