import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listPlans, type Plan } from "../api";

function daysUntil(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  // 清掉时分秒影响
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function getDisplay(p: Plan): { text: string; kind: "upcoming" | "ongoing" | "overdue" | "done" } {
  if (p.status === "completed") return { text: "已完成 ✓", kind: "done" };
  if (!p.target_date) return { text: "待安排日期", kind: "ongoing" };
  const d = daysUntil(p.target_date);
  if (d < 0) return { text: `已过 ${-d} 天`, kind: "overdue" };
  if (d === 0) return { text: "就是今天！", kind: "upcoming" };
  return { text: `还有 ${d} 天`, kind: d <= 7 ? "upcoming" : "ongoing" };
}

export default function PlanLibrary() {
  const nav = useNavigate();
  const [items, setItems] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listPlans();
      setItems(res.plans || []);
    } catch (e) {
      console.error("[plans] ❌ 加载失败:", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sorted = [...items].sort((a, b) => {
    // 未完成排前面，按 target_date ASC
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;
    if (!a.target_date && b.target_date) return 1;
    if (a.target_date && !b.target_date) return -1;
    return (a.target_date || "").localeCompare(b.target_date || "");
  });

  return (
    <div>
      <div className="flex items-center mb-1">
        <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">🎯 计划 · {items.length}</h3>
      </div>
      <p className="text-xs text-paper-ink3 mb-4">
        未来的打算、约定、目标都会出现在这里，帮你倒计时
      </p>

      {!loading && items.length === 0 && (
        <div className="py-12 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <p className="text-paper-ink2">还没有计划</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {sorted.map((p) => {
            const d = getDisplay(p);
            const isUpcoming = d.kind === "upcoming";
            const isDone = d.kind === "done";
            const isOverdue = d.kind === "overdue";
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (p.diary_id) nav(`/editor/${p.diary_id}`);
                  else nav(`/editor?template=plan`);
                }}
                className={`w-full text-left relative p-4 rounded-xl border transition cursor-pointer hover:shadow-md ${
                  isDone
                    ? "bg-green-50 border-green-200 opacity-70"
                    : isOverdue
                      ? "bg-red-50 border-red-200"
                      : isUpcoming
                        ? "bg-amber-50 border-amber-200 shadow-sm"
                        : "bg-white border-paper-line/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{p.icon || "🎯"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium text-paper-ink truncate ${isDone ? "line-through" : ""}`}>{p.title}</h4>
                      {isUpcoming && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-medium">
                          快来了
                        </span>
                      )}
                      {isDone && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-200 text-green-900 font-medium">
                          ✓ 完成
                        </span>
                      )}
                      {isOverdue && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-200 text-red-900 font-medium">
                          已过期
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 ${
                      isUpcoming ? "text-amber-800 font-medium" :
                      isDone ? "text-gray-400" :
                      isOverdue ? "text-red-600" : "text-paper-ink2"
                    }`}>
                      {d.text}
                    </p>
                    {p.description && (
                      <p className="text-xs text-paper-ink3 mt-1 line-clamp-2">{p.description}</p>
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
