import type { Diary } from "../types";
import DiaryCard from "./DiaryCard";

interface Props {
  date: string;
  diaries: Diary[];
  onOpen: (id: string) => void;
}

export default function DayList({ date, diaries, onOpen }: Props) {
  const d = new Date(date);
  const week = ["日","一","二","三","四","五","六"][d.getDay()];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="font-bold text-paper-ink">{date} · 周{week}</div>
        <div className="text-xs text-paper-ink2">
          {diaries.length > 0 ? `${diaries.length} 篇日记` : ""}
        </div>
      </div>

      {diaries.length === 0 ? (
        <div className="text-center text-paper-ink2 text-sm py-8 bg-paper-surface/60 rounded-2xl border border-paper-line/60">
          这一天还没有写日记 ✨
        </div>
      ) : (
        <div className="space-y-2">
          {diaries.map((di) => (
            <DiaryCard key={di.id} diary={di} onClick={() => onOpen(di.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
