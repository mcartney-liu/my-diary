import { useRef, useState } from "react";
import { X, Play, Pause } from "lucide-react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onRemove: () => void;
}

function fmtMs(ms: number) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function AudioBlock({ block, onRemove }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(block.durationMs ?? 0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  return (
    <div className="group relative">
      <audio
        ref={audioRef}
        src={block.content}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration * 1000)}
        onEnded={() => { setPlaying(false); setPos(0); }}
      />
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-paper-surface border border-paper-line">
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-full bg-paper-ink text-paper-bg flex items-center justify-center flex-shrink-0 active:scale-90 transition"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-paper-ink2 mb-1">
            <span>{fmtMs(pos)}</span>
            <span>{fmtMs(dur)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-line overflow-hidden">
            <div
              className="h-full bg-paper-ink transition-all"
              style={{ width: `${dur > 0 ? (pos / dur) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-full hover:bg-paper-line text-paper-ink2 opacity-50 group-hover:opacity-100 transition"
          title="删除"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
