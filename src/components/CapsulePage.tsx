import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Unlock, Clock } from "lucide-react";
import type { Diary } from "../types";
import { moodById } from "../data";

interface Props {
  diaries: Diary[];
}

function firstBlockText(d: Diary): string {
  return d.blocks.find((b) => b.kind === "text")?.content.trim().slice(0, 60) ?? "";
}

function timeLeft(ts: number): { days: number; hours: number; minutes: number } {
  const ms = ts - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0 };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return { days, hours, minutes };
}

export default function CapsulePage({ diaries }: Props) {
  const nav = useNavigate();

  // 只有 capsule 日记（capsuleUnlockAt 存在，且未删除）
  const sorted = useMemo(() =>
    diaries
      .filter((d) => d.capsuleUnlockAt && !d.deletedAt)
      .sort((a, b) => (a.capsuleUnlockAt ?? 0) - (b.capsuleUnlockAt ?? 0)),
    [diaries]
  );

  const locked = sorted.filter((d) => (d.capsuleUnlockAt ?? 0) > Date.now());
  const unlocked = sorted.filter((d) => (d.capsuleUnlockAt ?? 0) <= Date.now());

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      <header className="sticky top-0 z-10 bg-[#faf6ef]/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => nav("/", { replace: true })}
            className="p-2 -ml-2 rounded-full hover:bg-paper-surface active:scale-95"
          >
            <ArrowLeft size={20} className="text-paper-ink" />
          </button>
          <h1 className="text-base text-paper-ink font-medium">🫧 时间胶囊</h1>
          <span className="text-xs text-paper-ink2 ml-auto">
            {locked.length} 封存 · {unlocked.length} 已解锁
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {sorted.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">🫧</div>
            <p className="text-paper-ink2">还没有时间胶囊</p>
            <p className="text-xs text-paper-ink3 mt-1">
              写日记时选「时间胶囊」，就能把它锁进未来
            </p>
          </div>
        ) : (
          <>
            {/* 封存中的 */}
            {locked.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Lock size={14} className="text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">封存中</span>
                  <span className="text-[10px] text-amber-600/70">{locked.length} 篇</span>
                </div>
                <div className="space-y-2">
                  {locked.map((d) => {
                    const mood = moodById(d.moodId);
                    const tl = timeLeft(d.capsuleUnlockAt!);
                    const unlockDate = new Date(d.capsuleUnlockAt!).toLocaleDateString("zh-CN");
                    return (
                      <button
                        key={d.id}
                        onClick={() => nav(`/editor/${d.id}`)}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/70 hover:bg-amber-50 transition active:scale-[0.99]"
                      >
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl shrink-0">
                          🔒
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-amber-900 truncate">
                              {d.title || mood?.name || "无题"}
                            </h3>
                            <span className="text-[10px] text-amber-600/70 shrink-0">{d.date}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-amber-700/80 mt-0.5">
                            <Clock size={11} />
                            {tl.days > 0 && (
                              <span>{tl.days} 天</span>
                            )}
                            {tl.hours > 0 && (
                              <span>{tl.hours} 小时</span>
                            )}
                            {tl.days === 0 && tl.hours === 0 && (
                              <span>{tl.minutes} 分钟</span>
                            )}
                            <span className="text-amber-600/50">·</span>
                            <span>解锁于 {unlockDate}</span>
                          </div>
                        </div>
                        {mood && (
                          <span className="text-xl shrink-0 opacity-60">{mood.icon}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 已解锁的 */}
            {unlocked.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Unlock size={14} className="text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">已解锁</span>
                  <span className="text-[10px] text-emerald-600/70">{unlocked.length} 篇</span>
                </div>
                <div className="space-y-2">
                  {unlocked.map((d) => {
                    const mood = moodById(d.moodId);
                    const unlockDate = new Date(d.capsuleUnlockAt!).toLocaleDateString("zh-CN");
                    return (
                      <button
                        key={d.id}
                        onClick={() => nav(`/editor/${d.id}`)}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-paper-surface border border-paper-line hover:bg-paper-surface/80 transition active:scale-[0.99]"
                      >
                        {mood ? (
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                            style={{ backgroundColor: mood.color + "30" }}
                          >
                            {mood.icon}
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-paper-line/40 flex items-center justify-center text-xl shrink-0">
                            🫧
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-paper-ink truncate">
                              {d.title || mood?.name || "无题"}
                            </h3>
                            <span className="text-[10px] text-paper-ink3 shrink-0">{d.date}</span>
                          </div>
                          <p className="text-xs text-paper-ink2 truncate mt-0.5">
                            {firstBlockText(d) || "（仅图片/录音）"}
                          </p>
                          <div className="text-[10px] text-emerald-600/70 mt-0.5">
                            解锁于 {unlockDate}
                          </div>
                        </div>
                        <Unlock size={14} className="text-emerald-500 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
