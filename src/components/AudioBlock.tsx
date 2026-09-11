import { useEffect, useRef, useState } from "react";
import type { DiaryBlock } from "../types";

interface Props {
  block: DiaryBlock;
  onChange: (content: string, durationMs?: number) => void;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function AudioBlock({ block, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const dur = elapsed;
        const reader = new FileReader();
        reader.onload = () => {
          onChange(reader.result as string, dur);
          setElapsed(0);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 100), 100);
    } catch (err) {
      alert("录音需要麦克风权限，请允许后重试。");
    }
  };

  const stopRecord = () => {
    mrRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      audio.play();
    }
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      if (a.duration) setPlayProgress((a.currentTime / a.duration) * 100);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setPlayProgress(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, [block.content]);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      mrRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 空状态：录音按钮
  if (!block.content) {
    return (
      <div className="py-3">
        {!recording ? (
          <button
            onClick={startRecord}
            className="w-full py-4 rounded-xl bg-paper-surface hover:bg-red-50 border-2 border-dashed border-paper-line hover:border-red-300 flex items-center justify-center gap-3 transition-colors text-paper-ink2 hover:text-red-600"
          >
            <span className="w-10 h-10 rounded-full bg-red-400 flex items-center justify-center text-white text-lg">🎙️</span>
            <span className="text-sm">点击开始录音</span>
          </button>
        ) : (
          <button
            onClick={stopRecord}
            className="w-full py-4 rounded-xl bg-red-50 border-2 border-red-300 flex items-center justify-center gap-3 text-red-600 animate-pulse"
          >
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-mono text-lg">{fmtTime(elapsed)}</span>
            <span className="text-sm">点击停止</span>
          </button>
        )}
      </div>
    );
  }

  // 已有录音：播放器
  return (
    <div className="py-3">
      <audio ref={audioRef} src={block.content} />
      <div className="bg-paper-surface rounded-xl p-3 flex items-center gap-3 border border-paper-line">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-paper-ink text-paper-bg flex items-center justify-center shrink-0 hover:bg-paper-accent transition-colors"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-paper-line rounded-full overflow-hidden">
            <div
              className="h-full bg-paper-accent rounded-full transition-all"
              style={{ width: `${playProgress}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-paper-ink2 flex justify-between">
            <span>{playing ? "播放中" : "暂停"}</span>
            <span>{fmtTime(block.durationMs ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
