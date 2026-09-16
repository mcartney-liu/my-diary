import { useEffect, useState } from "react";
import { listMilestones, saveMilestone, deleteMilestone, type Milestone, type MilestoneType } from "../api";

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
    return { text: `还有 ${days} 天 · ${year}年`, kind: days <= 7 ? "upcoming" : "ongoing", emoji: "🎯" };
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
  return { text: "", kind: "ongoing", emoji: "🎯" };
}

// ====== 主组件 ======
export default function MilestoneLibrary() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listMilestones();
      setItems(res.milestones || []);
    } catch { /* ignore */ }
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

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这个纪念日吗？")) return;
    await deleteMilestone(id);
    setItems((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div>
      {/* 标题 + 新建按钮 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-paper-ink2 text-xs font-medium tracking-wider uppercase">📅 我的纪念日 · {items.length}</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium transition active:scale-95"
        >+ 新建</button>
      </div>

      {/* 空状态 */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-paper-ink3">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm">还没有纪念日呢</p>
          <p className="text-xs mt-1">点右上角「+ 新建」添加一个吧</p>
        </div>
      )}

      {/* 列表 */}
      {items.length > 0 && (
        <div className="space-y-3">
          {sorted.map((m) => {
            const d = getDisplay(m);
            const isUpcoming = d.kind === "upcoming";
            return (
              <div
                key={m.id}
                className={`relative p-4 rounded-xl border transition ${
                  isUpcoming
                    ? "bg-amber-50 border-amber-200 shadow-sm"
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
                    <p className={`text-sm mt-0.5 ${isUpcoming ? "text-amber-800 font-medium" : "text-paper-ink2"}`}>
                      {d.text}
                    </p>
                    {m.description && (
                      <p className="text-xs text-paper-ink3 mt-1 line-clamp-2">{m.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="shrink-0 text-paper-ink3 hover:text-red-500 text-xs px-2 py-1 rounded transition"
                  >删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新建弹窗 */}
      {showCreate && (
        <CreateMilestoneModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ====== 新建弹窗 ======
function CreateMilestoneModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<MilestoneType>("fixed");
  const [icon, setIcon] = useState("🎯");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetMm, setTargetMm] = useState<number>(new Date().getMonth() + 1);
  const [targetDd, setTargetDd] = useState<number>(new Date().getDate());
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const ICON_OPTIONS = ["🎯", "💞", "🎂", "🎄", "🐉", "📚", "✈️", "🏠", "🐈", "💼", "🎉", "⭐"];

  const handleSave = async () => {
    if (!title.trim()) { alert("请输入标题"); return; }
    setSaving(true);
    try {
      const payload: any = { type, icon, title: title.trim(), description };
      if (type === "fixed") { payload.target_mm = targetMm; payload.target_dd = targetDd; }
      if (type === "start") { payload.start_date = startDate; }
      if (type === "countdown") { payload.target_date = targetDate; }
      await saveMilestone(payload);
      onCreated();
    } catch (e: any) {
      alert(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-paper-card rounded-card shadow-2xl border border-paper-line/50 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-line/50">
          <h3 className="font-medium text-paper-ink">📅 新建纪念日</h3>
          <button onClick={onClose} className="text-paper-ink3 hover:text-paper-ink text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* 类型选择 */}
          <div>
            <label className="text-xs text-paper-ink2 font-medium mb-2 block">类型</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: "fixed", label: "🎯 每年重复", hint: "生日/纪念日" },
                { k: "start", label: "💞 第 N 天", hint: "从某天开始" },
                { k: "countdown", label: "⏳ 倒计时", hint: "距离某天" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setType(o.k as MilestoneType)}
                  className={`p-3 rounded-xl border text-center transition ${
                    type === o.k
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : "bg-white border-paper-line/60 text-paper-ink2"
                  }`}
                >
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{o.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 图标 */}
          <div>
            <label className="text-xs text-paper-ink2 font-medium mb-2 block">图标</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition ${
                    icon === ic ? "bg-amber-100 ring-2 ring-amber-300" : "bg-white border border-paper-line/60 hover:bg-paper-soft"
                  }`}
                >{ic}</button>
              ))}
            </div>
          </div>

          {/* 日期输入 - 根据类型 */}
          {type === "fixed" && (
            <div>
              <label className="text-xs text-paper-ink2 font-medium mb-2 block">日期</label>
              <div className="flex gap-2 items-center">
                <select value={targetMm} onChange={(e) => setTargetMm(+e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m} 月</option>
                  ))}
                </select>
                <select value={targetDd} onChange={(e) => setTargetDd(+e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d} 日</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {type === "start" && (
            <div>
              <label className="text-xs text-paper-ink2 font-medium mb-2 block">从哪一天开始算</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm" />
            </div>
          )}
          {type === "countdown" && (
            <div>
              <label className="text-xs text-paper-ink2 font-medium mb-2 block">目标日期</label>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm" />
            </div>
          )}

          {/* 标题 */}
          <div>
            <label className="text-xs text-paper-ink2 font-medium mb-2 block">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="妈妈的生日 / 和小希在一起"
              className="w-full px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm"
            />
          </div>

          {/* 描述（可选） */}
          <div>
            <label className="text-xs text-paper-ink2 font-medium mb-2 block">备注（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="写点什么..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-paper-line/60 text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-paper-line/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-paper-soft text-paper-ink2 text-sm font-medium hover:bg-paper-line/40 transition"
          >取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50 active:scale-[0.98]"
          >{saving ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </div>
  );
}
