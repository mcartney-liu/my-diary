import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listPlans, savePlan, updatePlan, type Plan } from "../api";

function daysUntil(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
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
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");

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
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;
    if (!a.target_date && b.target_date) return 1;
    if (a.target_date && !b.target_date) return -1;
    return (a.target_date || "").localeCompare(b.target_date || "");
  });

  const handleCreate = async () => {
    if (!newTitle.trim()) return alert("请输入标题");
    try {
      await savePlan({
        title: newTitle.trim(),
        target_date: newDate || undefined,
        description: newDesc.trim() || undefined,
        icon: "🎯",
      });
      setNewTitle("");
      setNewDate("");
      setNewDesc("");
      setShowForm(false);
      await load();
    } catch (e) {
      alert("创建失败：" + (e as Error).message);
    }
  };

  const toggleDone = async (p: Plan) => {
    const nextStatus = p.status === "completed" ? undefined : "completed";
    const optimistic: Plan[] = items.map((x) =>
      x.id === p.id ? { ...x, status: nextStatus as any } : x
    );
    setItems(optimistic);
    try {
      await updatePlan({ id: p.id, status: nextStatus as any });
    } catch (e) {
      alert("更新失败：" + (e as Error).message);
      await load();
    }
  };

  return (
    <div>
      <div className="flex items-center mb-1">
        <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">🎯 计划 · {items.length}</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto text-xs px-2 py-0.5 rounded-full bg-paper-accent/15 text-paper-accent hover:bg-paper-accent/25 transition"
        >{showForm ? "收起" : "＋ 新计划"}</button>
      </div>
      <p className="text-xs text-paper-ink3 mb-4">
        未来的打算、约定、目标都会出现在这里，帮你倒计时
      </p>

      {/* 内联新建表单 */}
      {showForm && (
        <div className="mb-4 p-3 rounded-xl bg-paper-surface border border-paper-line space-y-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="计划标题，比如「跑半马」"
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="描述（可选）"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-paper-ink3 hover:text-paper-ink px-3 py-1.5">取消</button>
            <button onClick={handleCreate} className="text-xs bg-paper-accent text-paper-card rounded-md px-4 py-1.5 font-medium hover:opacity-90 transition">创建</button>
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <p className="text-paper-ink2">还没有计划</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-paper-accent text-paper-card text-sm font-medium hover:opacity-90 transition"
          >＋ 加一个计划</button>
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
              <div
                key={p.id}
                className={`flex items-center gap-3 p-4 rounded-xl border transition ${
                  isDone
                    ? "bg-green-50 border-green-200 opacity-70"
                    : isOverdue
                      ? "bg-red-50 border-red-200"
                      : isUpcoming
                        ? "bg-amber-50 border-amber-200 shadow-sm"
                        : "bg-paper-card border-paper-line/60"
                }`}
              >
                {/* 完成勾选 */}
                <button
                  onClick={() => toggleDone(p)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                    isDone ? "bg-green-500 border-green-500 text-white" : "border-paper-line hover:border-paper-accent"
                  }`}
                  title={isDone ? "标记未完成" : "标记完成"}
                >{isDone ? "✓" : ""}</button>

                {/* 主信息（点击跳编辑器） */}
                <button
                  onClick={() => {
                    if (p.diary_id) nav(`/editor/${p.diary_id}`);
                    else nav(`/editor?template=plan`);
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-xl shrink-0">{p.icon || "🎯"}</div>
                    <h4 className={`font-medium text-paper-ink truncate ${isDone ? "line-through" : ""}`}>{p.title}</h4>
                    {isUpcoming && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-medium">快来了</span>}
                    {isDone && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-200 text-green-900 font-medium">✓ 完成</span>}
                    {isOverdue && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-200 text-red-900 font-medium">已过期</span>}
                  </div>
                  <p className={`text-sm mt-0.5 ${isUpcoming ? "text-amber-800 font-medium" : isDone ? "text-paper-ink3" : isOverdue ? "text-red-600" : "text-paper-ink2"}`}>
                    {d.text}
                  </p>
                  {p.description && <p className="text-xs text-paper-ink3 mt-1 line-clamp-2">{p.description}</p>}
                </button>

                <span className="text-paper-ink3 text-sm shrink-0">›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
