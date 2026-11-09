import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMilestones, saveMilestone, type Milestone, type MilestoneType } from "../api";

const TYPE_LABEL: Record<MilestoneType, { label: string; icon: string; hint: string }> = {
  fixed:     { label: "固定日期", icon: "🎈", hint: "每年这一天都会提醒你" },
  start:     { label: "起始日期", icon: "🎂", hint: "从这一天开始算第几天" },
  countdown: { label: "倒计时",   icon: "⏳", hint: "距离这一天还有多久" },
};

export default function MilestoneLibrary() {
  const nav = useNavigate();
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<MilestoneType>("fixed");

  const load = async () => {
    setLoading(true);
    try {
      const res = await listMilestones();
      setItems(res.milestones || []);
    } catch (e) {
      console.error("[milestones] ❌ 加载失败:", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return alert("请输入标题");
    if (!newDate) return alert("请选择日期");
    // 按类型传对字段 — 同时填 target_date（列表和月历都读这个）
    const [, m, d] = newDate.split("-").map(Number);
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const payload = {
      title: newTitle.trim(),
      type: newType,
      icon: TYPE_LABEL[newType].icon,
      ...(newType === "fixed" ? { target_mm: m, target_dd: d, target_date: `${new Date().getFullYear()}-${mm}-${dd}` } :
          newType === "start" ? { start_date: newDate, target_date: newDate } :
          { target_date: newDate }),
    };
    try {
      await saveMilestone(payload);
      setNewTitle("");
      setNewDate("");
      setNewType("fixed");
      setShowForm(false);
      await load();
    } catch (e) {
      alert("创建失败：" + (e as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center mb-1">
        <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">🎈 纪念日 · {items.length}</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto text-xs px-2 py-0.5 rounded-full bg-paper-accent/15 text-paper-accent hover:bg-paper-accent/25 transition"
        >{showForm ? "收起" : "＋ 新纪念日"}</button>
      </div>
      <p className="text-xs text-paper-ink3 mb-4">
        每年这一天小麦会提醒你，在日历上显示 🎈
      </p>

      {showForm && (
        <div className="mb-4 p-3 rounded-xl bg-paper-surface border border-paper-line space-y-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="纪念日名称，比如「认识小刘的日子」"
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as MilestoneType)}
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent"
          >
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label} — {v.hint}</option>
            ))}
          </select>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm focus:outline-none focus:border-paper-accent"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-paper-ink3 hover:text-paper-ink px-3 py-1.5">取消</button>
            <button onClick={handleCreate} className="text-xs bg-paper-accent text-paper-card rounded-md px-4 py-1.5 font-medium hover:opacity-90 transition">创建</button>
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <div className="text-5xl mb-3">🎈</div>
          <p className="text-paper-ink2">还没有纪念日</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-paper-accent text-paper-card text-sm font-medium hover:opacity-90 transition"
          >＋ 加一个纪念日</button>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((m) => {
            const meta = TYPE_LABEL[m.type];
            return (
              <div
                key={m.id}
                onClick={() => { if (m.diary_id) nav(`/editor/${m.diary_id}`); }}
                className="flex items-center gap-3 p-4 rounded-xl bg-paper-card border border-paper-line/60 cursor-pointer hover:border-paper-accent/40 hover:shadow-sm transition"
              >
                <div className="text-xl">{m.icon || meta.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-paper-ink truncate">{m.title}</h4>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-paper-surface text-paper-ink2 shrink-0">{meta.label}</span>
                  </div>
                  {m.target_date && <p className="text-xs text-paper-ink2 mt-0.5">{m.target_date}</p>}
                  {m.description && <p className="text-xs text-paper-ink3 mt-0.5 truncate">{m.description}</p>}
                </div>
                <span className="text-paper-ink3 text-sm">›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
