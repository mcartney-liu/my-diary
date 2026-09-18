import { useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { Diary } from "../types";
import { FINANCE_CATEGORIES, resolveCategory, categoryMeta } from "../categories";

interface Props {
  diaries: Diary[];
}

// 分类占比柱图颜色（按 FINANCE_CATEGORIES 顺序分配）
const BAR_COLORS = [
  "#f97316", "#3b82f6", "#ec4899", "#8b5cf6", "#10b981",
  "#06b6d4", "#f59e0b", "#ef4444", "#6366f1", "#6b7280",
  "#14b8a6", "#eab308", "#84cc16", "#22c55e", "#a855f7",
];

function cnYuan(n: number): string {
  return "¥ " + n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface FinanceItem {
  value: number;
  direction: "expense" | "income";
  category: string;
  content: string;
  date: string;        // 日记的 date
  diaryId: string;     // 点击跳转用
}

export default function FinancePage({ diaries }: Props) {
  const nav = useNavigate();

  const items: FinanceItem[] = useMemo(() => {
    const list: FinanceItem[] = [];
    for (const d of diaries) {
      if (d.templateId !== "finance" || d.deletedAt) continue;
      for (const b of d.blocks) {
        if (b.kind !== "finance_item" || !b.value || b.deleted) continue;
        const dir = b.direction ?? "expense";
        // 🔑 关键词兜底 + 历史遗留 key 映射 + 真源校验
        const resolvedCat = resolveCategory(b.category, dir, b.content || d.title);
        list.push({
          value: b.value,
          direction: dir,
          category: resolvedCat,
          content: b.content || "",
          date: d.date,
          diaryId: d.id,
        });
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date)); // 日期倒序
  }, [diaries]);

  // 本月聚合
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthItems = useMemo(() => items.filter((i) => i.date.startsWith(ym)), [items, ym]);

  const monthExpense = useMemo(
    () => monthItems.filter((i) => i.direction === "expense").reduce((s, i) => s + i.value, 0),
    [monthItems]
  );
  const monthIncome = useMemo(
    () => monthItems.filter((i) => i.direction === "income").reduce((s, i) => s + i.value, 0),
    [monthItems]
  );
  const monthBalance = monthIncome - monthExpense;

  // 分类占比（只看支出）
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of monthItems) {
      if (i.direction !== "expense") continue;
      const cur = map.get(i.category) ?? 0;
      map.set(i.category, cur + i.value);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries())
      .map(([cat, val]) => ({ cat, val, pct: total > 0 ? (val / total) * 100 : 0 }))
      .sort((a, b) => b.val - a.val);
  }, [monthItems]);

  // 最近 14 天支出趋势
  const last14Days = useMemo(() => {
    const days: { date: string; expense: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const sum = items
        .filter((x) => x.date === key && x.direction === "expense")
        .reduce((s, x) => s + x.value, 0);
      days.push({ date: key, expense: sum });
    }
    return days;
  }, [items]);

  const maxDayExpense = Math.max(1, ...last14Days.map((d) => d.expense));

  // 🛠️ DEBUG: 临时打印 items 和 last14Days 看为什么柱图空白
  useEffect(() => {
    console.log("[FinancePage DEBUG] items:", items.map(i => ({ date: i.date, direction: i.direction, value: i.value })));
    console.log("[FinancePage DEBUG] last14Days:", last14Days);
    console.log("[FinancePage DEBUG] maxDayExpense:", maxDayExpense);
  }, [items, last14Days, maxDayExpense]);

  const hasData = items.length > 0;

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
          <h1 className="text-base text-paper-ink font-medium">💰 记账统计</h1>
          {hasData && (
            <span className="text-xs text-paper-ink2 ml-auto">
              {monthItems.length} 笔 · {ym}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-5">
        {/* 常驻说明 */}
        <p className="text-xs text-paper-ink3">
          写日记时选「记账」模板，每一笔支出和收入都会自动汇总到这里
        </p>

        {!hasData ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">💰</div>
            <p className="text-paper-ink2">还没有记账哦</p>
            <p className="text-xs text-paper-ink3 mt-1">
              写日记时选「记账」模板，就能在这里看到支出、收入和分类汇总
            </p>
          </div>
        ) : (
          <>
            {/* 三卡片 */}
            <section className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                <div className="text-[11px] text-red-600/80">本月支出</div>
                <div className="text-base font-semibold text-red-700 mt-1">
                  {cnYuan(monthExpense)}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="text-[11px] text-emerald-600/80">本月收入</div>
                <div className="text-base font-semibold text-emerald-700 mt-1">
                  {cnYuan(monthIncome)}
                </div>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  monthBalance >= 0
                    ? "border-blue-200 bg-blue-50/60"
                    : "border-amber-200 bg-amber-50/60"
                }`}
              >
                <div
                  className={`text-[11px] ${
                    monthBalance >= 0 ? "text-blue-600/80" : "text-amber-600/80"
                  }`}
                >
                  本月结余
                </div>
                <div
                  className={`text-base font-semibold mt-1 ${
                    monthBalance >= 0 ? "text-blue-700" : "text-amber-700"
                  }`}
                >
                  {monthBalance >= 0 ? "+" : ""}
                  {cnYuan(monthBalance)}
                </div>
              </div>
            </section>

            {/* 分类占比 */}
            {categoryBreakdown.length > 0 && (
              <section className="rounded-xl bg-paper-surface border border-paper-line p-3">
                <h2 className="text-xs font-medium text-paper-ink mb-2">
                  📊 {ym} 支出分类
                </h2>
                <div className="space-y-2">
                  {categoryBreakdown.map(({ cat, val, pct }) => {
                    const meta = categoryMeta(cat);
                    const colorIdx = FINANCE_CATEGORIES.findIndex((c) => c.key === cat);
                    const color = BAR_COLORS[colorIdx % BAR_COLORS.length];
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <span className="text-base w-6 text-center">{meta.icon}</span>
                        <span className="text-xs text-paper-ink w-12">{meta.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-paper-line/50 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-paper-ink w-16 text-right tabular-nums">
                          {cnYuan(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 近 14 天支出趋势 */}
            <section className="rounded-xl bg-paper-surface border border-paper-line p-3">
              <h2 className="text-xs font-medium text-paper-ink mb-2">
                📅 近 14 天支出
              </h2>
              {/* 🔑 items-center + 每个柱父容器 h-full → 百分比高度有参照 */}
              <div className="flex items-end gap-0.5 h-24 relative">
                {last14Days.map((d) => {
                  const h = (d.expense / maxDayExpense) * 100;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                      onClick={() => nav(`/editor?template=finance&date=${d.date}`)}
                      title={`${d.date} 支出 ${cnYuan(d.expense)}`}
                    >
                      {/* 柱 — justify-end 把柱推到底部，高度 % 自然从下往上长 */}
                      <div
                        className="w-full rounded-t bg-rose-400 group-hover:bg-rose-500 transition-all"
                        style={{ height: `${Math.max(h, d.expense > 0 ? 4 : 1)}%` }}
                      />
                      {/* 日期标签 — 14 天全部显示，避免拥挤 */}
                      <div className="text-[8px] text-paper-ink3 tabular-nums mt-1 leading-none">
                        {d.date.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 最近流水 */}
            <section className="rounded-xl bg-paper-surface border border-paper-line overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <h2 className="text-xs font-medium text-paper-ink">📝 最近流水</h2>
                <span className="text-[10px] text-paper-ink3">全部 {items.length} 笔</span>
              </div>
              <div className="divide-y divide-paper-line/50">
                {items.slice(0, 20).map((it, idx) => {
                  const meta = categoryMeta(it.category);
                  const isExpense = it.direction === "expense";
                  const m = it.date.slice(5).replace("-", "月") + "日";
                  return (
                    <button
                      key={idx}
                      onClick={() => nav(`/editor/${it.diaryId}`)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-paper-surface/50 transition active:scale-[0.99]"
                    >
                      <span className="text-base w-6 text-center shrink-0">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-paper-ink truncate">
                            {it.content || meta.name}
                          </span>
                          <span className="text-[10px] text-paper-ink3 shrink-0">{m}</span>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-medium tabular-nums shrink-0 ${
                          isExpense ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {isExpense ? "-" : "+"}
                        {cnYuan(it.value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
