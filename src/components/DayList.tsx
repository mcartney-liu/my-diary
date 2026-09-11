import { useNavigate } from "react-router-dom";
import type { Diary } from "../types";
import { moodById } from "../data";

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

export default function DayList({ date, diaries }: Props) {
  const nav = useNavigate();
  const sorted = [...diaries].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section className="card p-4 md:p-6 animate-fade-up">
      <h2 className="text-base md:text-lg font-semibold text-paper-ink mb-3 flex items-center gap-2">
        <span className="text-paper-accent">📖</span>
        {date}
        <span className="text-xs font-normal text-paper-ink2">· 周 {weekdayCN(date)}</span>
        <span className="text-xs font-normal text-paper-ink2 ml-auto">
          {sorted.length} 篇
        </span>
      </h2>

      {sorted.length === 0 ? (
        <button
          onClick={() => nav("/editor")}
          className="w-full text-center py-8 rounded-xl border-2 border-dashed border-paper-line text-paper-ink2 hover:border-paper-accent hover:text-paper-accent transition-colors"
        >
          这一天还没有写日记 ✨
          <br />
          <span className="text-xs">点击写第一篇</span>
        </button>
      ) : (
        <ul className="space-y-3">
          {sorted.map((d, idx) => {
            const mood = moodById(d.moodId);
            return (
              <li
                key={d.id}
                onClick={() => nav(`/editor/${d.id}`)}
                className="group cursor-pointer p-3 md:p-4 rounded-xl bg-paper-surface/60 hover:bg-paper-surface transition-all hover:shadow-soft border border-transparent hover:border-paper-line animate-fade-up"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  {/* 心情小方块 */}
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
                      <h3 className="font-medium text-paper-ink truncate">
                        {d.title || (mood ? mood.name : "无题")}
                      </h3>
                      {hasImage(d) && (
                        <span className="text-xs text-paper-ink3 shrink-0">🖼️</span>
                      )}
                    </div>
                    <p className="text-sm text-paper-ink2 line-clamp-2 leading-relaxed">
                      {firstBlockText(d) || <span className="italic text-paper-ink3">（仅图片/录音）</span>}
                    </p>
                    <div className="mt-1.5 text-[11px] text-paper-ink3">
                      更新于 {new Date(d.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
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
