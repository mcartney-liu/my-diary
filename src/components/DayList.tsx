import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { moodById } from "../data";
import { templateById } from "../templates";

interface Props {
  date: string;
  diaries: Diary[];
}

function weekdayCN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cn = ["日", "一", "二", "三", "四", "五", "六"];
  return cn[new Date(y, m - 1, d).getDay()];
}

function firstBlockText(d: Diary): string {
  const t = d.blocks.find((b) => b.kind === "text")?.content ?? "";
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
}

function hasImage(d: Diary): boolean {
  return d.blocks.some((b) => b.kind === "image");
}
function hasAudio(d: Diary): boolean {
  return d.blocks.some((b) => b.kind === "audio");
}

function daysUntilUnlock(ms: number): number {
  return Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function DayList({ date, diaries }: Props) {
  const nav = useNavigate();
  const sorted = [...diaries].sort((a, b) => b.updatedAt - a.updatedAt);
  const capsuleLockedCount = sorted.filter(
    (d) => d.capsuleUnlockAt && d.capsuleUnlockAt > Date.now()
  ).length;

  // 模板统计（今日每种模板多少篇）
  const templateStats = sorted.reduce<Record<string, number>>((acc, d) => {
    const tid = d.templateId ?? "diary";
    acc[tid] = (acc[tid] ?? 0) + 1;
    return acc;
  }, {});
  const hasDiaries = sorted.length > 0;

  return (
    <section className="card p-4 md:p-6 animate-fade-up">
      <h2 className="text-base md:text-lg font-semibold text-paper-ink mb-3 flex items-center gap-2">
        <span className="text-paper-accent">📖</span>
        {date}
        <span className="text-xs font-normal text-paper-ink2">· 周{weekdayCN(date)}</span>
        <span className="text-xs font-normal text-paper-ink2 ml-auto">
          {sorted.length} 篇
          {capsuleLockedCount > 0 && <span className="text-amber-600">（含 {capsuleLockedCount} 🔒）</span>}
        </span>
      </h2>

      {/* 模板统计标签 — 直接展示 */}
      {hasDiaries && (
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          {Object.entries(templateStats)
            .sort((a, b) => b[1] - a[1])
            .map(([tid, count]) => {
              const tpl = templateById(tid);
              return (
                <span
                  key={tid}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-paper-surface border border-paper-line text-paper-ink2"
                >
                  {tpl?.icon ?? "📖"} {tpl?.name ?? "日记"} × {count}
                </span>
              );
            })}
        </div>
      )}

      {sorted.length === 0 ? (
        <button
          onClick={() => nav("/editor")}
          className="w-full text-center py-8 rounded-xl border-2 border-dashed border-paper-line text-paper-ink2 hover:border-paper-accent hover:text-paper-accent transition-colors"
        >
          这一天还没有写日记 ✍️
          <br />
          <span className="text-xs">点击写第一篇</span>
        </button>
      ) : (
        <ul className="space-y-3">
          {sorted.map((d, idx) => {
            const mood = moodById(d.moodId);
            const isLocked = !!(d.capsuleUnlockAt && d.capsuleUnlockAt > Date.now());

            // 被 capsule 锁的：灰色+🔒，不能点击
            if (isLocked) {
              const daysLeft = daysUntilUnlock(d.capsuleUnlockAt!);
              return (
                <li
                  key={d.id}
                  className="p-3 md:p-4 rounded-xl bg-amber-50/60 border border-amber-200/60 animate-fade-up"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-amber-100 flex items-center justify-center text-lg shrink-0">
                      🔒
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-amber-800/70 truncate">
                          {d.title || "（锁定中）"}
                        </h3>
                      </div>
                      <p className="text-sm text-amber-700/50 italic">
                        内容已封存，还有 {daysLeft} 天解锁
                      </p>
                      <div className="mt-1.5 text-[11px] text-amber-600/60">
                        解锁时间：{new Date(d.capsuleUnlockAt!).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                  </div>
                </li>
              );
            }

            // 正常已解锁
            const dTpl = templateById(d.templateId ?? "diary");
            return (
              <li
                key={d.id}
                onClick={() => nav(`/editor/${d.id}`)}
                className="group cursor-pointer p-3 md:p-4 rounded-xl bg-paper-surface/60 hover:bg-paper-surface transition-all hover:shadow-soft border border-transparent hover:border-paper-line animate-fade-up"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  {mood ? (
                    <div
                      className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-lg md:text-xl shrink-0 shadow-soft"
                      style={{ backgroundColor: mood.color + "40" }}
                      title={mood.name}
                    >
                      {mood.icon}
                    </div>
                  ) : (
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-paper-line/50 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {dTpl && (
                        <span className="text-base leading-none shrink-0" title={dTpl.name}>
                          {dTpl.icon}
                        </span>
                      )}
                      <h3 className="font-medium text-paper-ink truncate">
                        {d.title || (mood ? mood.name : "无题")}
                      </h3>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {hasImage(d) && <span className="text-xs text-paper-ink3">🖼️</span>}
                        {hasAudio(d) && <span className="text-xs text-paper-ink3">🎙️</span>}
                      </div>
                    </div>
                    <p className="text-sm text-paper-ink2 line-clamp-2 leading-relaxed">
                      {firstBlockText(d) || <span className="italic text-paper-ink3">（仅图片/录音）</span>}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-paper-ink3">
                        更新于 {new Date(d.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {d.tags && d.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {d.tags.map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
