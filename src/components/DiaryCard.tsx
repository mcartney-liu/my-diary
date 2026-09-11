import type { Diary } from "../types";
import { moodById } from "../data";

export default function DiaryCard({ diary, onClick }: { diary: Diary; onClick: () => void }) {
  const mood = moodById(diary.moodId);
  const preview = diary.blocks.find((b) => b.kind === "text" && b.content.trim())?.content
    ?.split("\n")
    .find((l) => l.trim())
    ?.slice(0, 60) ?? "";
  const hasImage = diary.blocks.some((b) => b.kind === "image");
  const hasAudio = diary.blocks.some((b) => b.kind === "audio");
  const time = new Date(diary.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-paper-surface/70 hover:bg-paper-surface rounded-2xl p-4 border border-paper-line transition active:scale-[0.98]"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: mood?.color ?? "#e0d8c4" }}
        >
          {mood?.icon ?? "📝"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-paper-ink truncate">
              {diary.title.trim() || "无标题"}
            </div>
            <div className="text-xs text-paper-ink2 flex-shrink-0">{time}</div>
          </div>
          {preview && (
            <div className="text-sm text-paper-ink2 mt-1 line-clamp-2">{preview}</div>
          )}
          <div className="flex gap-2 mt-1.5 text-xs text-paper-ink2">
            {hasImage && <span>🖼️ 图片</span>}
            {hasAudio && <span>🎙️ 录音</span>}
            <span className="ml-auto">共 {diary.blocks.length} 块</span>
          </div>
        </div>
      </div>
    </button>
  );
}
