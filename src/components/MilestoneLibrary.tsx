import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMilestones, type Milestone } from "../api";

// ====== 倒计时计算 ======
function daysUntilNextFixed(mm: number, dd: number): { days: number; year: number } {
  const now = new Date();
  let year = now.getFullYear();
  let next = new Date(year, mm - 1, dd);
  if (next <= now) { year++; next = new Date(year, mm - 1, dd); }
  return { days: Math.ceil((next.getTime() - now.getTime()) / 86400000), year };
}

function daysSince(startDate: string): number {
  const now = new Date();
  const start = new Date(startDate);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

function daysUntil(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function getDisplay(m: Milestone): { text: string; kind: "upcoming" | "ongoing" | "passed"; emoji: string } {
  if (m.type === "fixed" && m.target_mm && m.target_dd) {
    const { days, year } = daysUntilNextFixed(m.target_mm, m.target_dd);
    return { text: `还有 ${days} 天 · ${year}年`, kind: days <= 7 ? "upcoming" : "ongoing", emoji: "🎈" };
  }
  if (m.type === "start" && m.start_date) {
    const d = daysSince(m.start_date);
    return { text: `已经 ${d} 天了`, kind: "ongoing", emoji: "💞" };
  }
  if (m.type === "countdown" && m.target_date) {
    const d = daysUntil(m.target_date);
    if (d < 0) return { text: `已过 ${-d} 天`, kind: "passed", emoji: "⏰" };
    if (d === 0) return { text: "就是今天！", kind: "upcoming", emoji: "🎉" };
    return { text: `还有 ${d} 天`, kind: d <= 7 ? "upcoming" : "ongoing", emoji: "⏳" };
  }
  return { text: "", kind: "ongoing", emoji: "🎈" };
}

// ====== 主组件 ======
export default function MilestoneLibrary() {
  const nav = useNavigate();
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listMilestones();
      console.log("[milestones] 🎈 API 返回:", JSON.stringify(res));
      setItems(res.milestones || []);
    } catch (e) {
      console.error("[milestones] ❌ 加载失败:", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 排序：upcoming 在前，ongoing 在后，passed 最后
  const sorted = [...items].sort((a, b) => {
    const da = getDisplay(a);
    const db = getDisplay(b);
    const order = { upcoming: 0, ongoing: 1, passed: 2 };
    return order[da.kind] - order[db.kind];
  });

  return (
    <div>
      {/* 标题 */}
      <div className="flex items-center mb-1">
        <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">🎈 纪念日 · {items.length}</h3>
      </div>
      <p className="text-xs text-paper-ink3 mb-4">
        值得记住的日子都放这儿——生日、纪念日、节日，每年会自动提醒你
      </p>

      {/* 空状态 */}
      {!loading && items.length === 0 && (
        <div className="py-12 text-center">
          <div className="text-5xl mb-3">🎈</div>
          <p className="text-paper-ink2">还没有纪念日</p>
        </div>
      )}

      {/* 列表 */}
      {items.length > 0 && (
        <div className="space-y-3">
          {sorted.map((m) => {
            const d = getDisplay(m);
            const isUpcoming = d.kind === "upcoming";
            return (
              <button
                key={m.id}
                onClick={() => m.diary_id && nav(`/editor/${m.diary_id}`)}
                className={`w-full text-left relative p-4 rounded-xl border transition cursor-pointer hover:shadow-md ${
                  isUpcoming
                    ? "bg-amber-50 border-amber-200 shadow-sm"
                    : d.kind === "passed"
                      ? "bg-gray-50 border-gray-200 opacity-70"
                      : "bg-white border-paper-line/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{m.icon || d.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-paper-ink truncate">{m.title}</h4>
                      {isUpcoming && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-medium">
                          快来了
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 ${isUpcoming ? "text-amber-800 font-medium" : d.kind === "passed" ? "text-gray-400" : "text-paper-ink2"}`}>
                      {d.text}
                    </p>
                    {m.description && (
                      <p className="text-xs text-paper-ink3 mt-1 line-clamp-2">{m.description}</p>
                    )}
                  </div>
                  <span className="text-paper-ink3 text-sm">›</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
