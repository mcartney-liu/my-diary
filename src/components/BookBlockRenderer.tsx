/**
 * BookBlockRenderer — 书本版 DiaryBlock 渲染（GoodNotes 风格）
 *
 * 和 EditorPage 里的 BlockRenderer 完全独立。
 * EditorPage 里保持"信纸自由排版"，BookView 里用"书本深度渲染"。
 *
 * 只负责渲染，不处理编辑（BookView 是浏览模式）。
 */

import type { DiaryBlock } from "../types";
import { Check, X, Quote, BookOpen, Minus } from "lucide-react";

export function BookBlockRenderer({ block }: { block: DiaryBlock; index: number }) {
  switch (block.kind) {
    case "text":
      return <TextBlock content={block.content} />;
    case "heading":
      return <HeadingBlock content={block.content} />;
    case "checkbox":
      return <CheckboxBlock content={block.content} checked={block.checked ?? false} />;
    case "finance_item":
      return (
        <FinanceBlock
          direction={block.direction ?? "expense"}
          category={block.category ?? ""}
          value={block.value ?? 0}
          note={block.content}
        />
      );
    case "number":
      return <NumberBlock label={block.content} value={block.value ?? 0} unit={block.unit ?? ""} />;
    case "divider":
      return <DividerBlock />;
    case "quote":
      return <QuoteBlock content={block.content} />;
    case "book":
      return <BookNoteBlock content={block.content} />;
    case "image":
      return <ImageBlock dataUrl={block.content} />;
    default:
      return <TextBlock content={block.content} />;
  }
}

// ========== 各类型渲染 ==========

function TextBlock({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <p className="book-text leading-[1.9] text-[1.05rem] text-stone-800 whitespace-pre-wrap break-words">
      {content}
    </p>
  );
}

function HeadingBlock({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 shrink-0" />
      <h3 className="book-heading text-xl font-bold text-stone-800 tracking-wide">{content}</h3>
    </div>
  );
}

function CheckboxBlock({ content, checked }: { content: string; checked: boolean }) {
  const colorClass = checked
    ? "bg-emerald-500 text-white shadow-emerald-200"
    : "bg-rose-400 text-white shadow-rose-200";
  const labelClass = checked ? "line-through text-stone-400" : "text-stone-700";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm ${colorClass}`}
      >
        {checked ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
      </div>
      <span className={`text-base ${labelClass}`}>{content || "待办"}</span>
    </div>
  );
}

function FinanceBlock({
  direction,
  category,
  value,
  note,
}: {
  direction: "expense" | "income";
  category: string;
  value: number;
  note?: string;
}) {
  const isExpense = direction === "expense";
  const cardBg = isExpense ? "bg-rose-50/80" : "bg-emerald-50/80";
  const valueColor = isExpense ? "text-rose-600" : "text-emerald-600";
  const label = isExpense ? "支出" : "收入";
  const sign = isExpense ? "−" : "+";

  return (
    <div className={`${cardBg} rounded-xl px-4 py-3 my-2 border border-stone-200/60`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isExpense ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
            {label}
          </span>
          {category && (
            <span className="text-xs text-stone-500">{category}</span>
          )}
        </div>
        <div className={`text-xl font-bold tabular-nums ${valueColor}`}>
          ¥{sign}{value.toFixed(2)}
        </div>
      </div>
      {note && (
        <p className="text-xs text-stone-500 mt-1 italic">{note}</p>
      )}
    </div>
  );
}

function NumberBlock({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex items-baseline justify-between py-2">
      <span className="text-sm text-stone-600 bg-stone-100 rounded-full px-3 py-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-stone-800 tabular-nums">{value}</span>
        {unit && <span className="text-sm text-stone-500">{unit}</span>}
      </div>
    </div>
  );
}

function DividerBlock() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 border-t border-dashed border-stone-300" />
      <Minus className="w-4 h-4 text-stone-300" />
      <div className="flex-1 border-t border-dashed border-stone-300" />
    </div>
  );
}

function QuoteBlock({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <blockquote className="relative pl-6 py-3 my-3 bg-amber-50/60 rounded-r-lg border-l-4 border-amber-300">
      <Quote className="absolute -left-1 top-2 w-5 h-5 text-amber-300" />
      <p className="text-stone-600 italic">{content}</p>
    </blockquote>
  );
}

function BookNoteBlock({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="flex gap-3 my-3">
      <BookOpen className="w-5 h-5 text-indigo-400 shrink-0 mt-1" />
      <p className="text-stone-600 text-sm">{content}</p>
    </div>
  );
}

function ImageBlock({ dataUrl }: { dataUrl: string }) {
  if (!dataUrl) return null;
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-stone-200">
      <img src={dataUrl} alt="" className="w-full" />
    </div>
  );
}
