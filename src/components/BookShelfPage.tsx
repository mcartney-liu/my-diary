import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { Diary } from "../types";
import { TEMPLATES } from "../templates";
import BookReader, { BOOK_THEMES } from "./BookReader";
import { parseDate } from "../data";

interface Props {
  diaries: Diary[];
}

function fmtChinese(d: string): string {
  const date = parseDate(d);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ================================================================
// 📚 BookCover — 每种模板一个真·本子封面
// 全部 CSS + SVG 画，零图片资源
// ================================================================

interface BookCoverProps {
  templateId: string;
  templateName: string;
  icon: string;
  count: number;
  latestDate?: string;
}

/** 活页螺旋环（左边一排圆环） */
function SpiralRings({ count = 8, color = "#9ca3af" }: { count?: number; color?: string }) {
  return (
    <svg
      className="absolute left-0 top-0 bottom-0 w-[14px] h-full z-10"
      viewBox={`0 0 14 ${count * 16}`}
      preserveAspectRatio="none"
    >
      {Array.from({ length: count }).map((_, i) => (
        <circle
          key={i}
          cx="7"
          cy={8 + i * 16}
          r="4"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
      ))}
    </svg>
  );
}

/** 书脊厚度（左边深色条 + 书页露白） */
function BookSpine({ color }: { color: string }) {
  return (
    <>
      {/* 书脊（阴影） */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l"
        style={{ background: `linear-gradient(to right, ${color} 0%, transparent 100%)` }}
      />
      {/* 书页露白（右边） */}
      <div
        className="absolute right-[-2px] top-[3px] bottom-[3px] w-[4px] rounded-r"
        style={{
          background: "linear-gradient(to right, #f0ebe0, #e8e0cc, #f0ebe0)",
          boxShadow: "inset 1px 0 2px rgba(0,0,0,0.08)",
        }}
      />
    </>
  );
}

/** 本子封面 — 根据 templateId 分派 */
function BookCover({ templateId, templateName, icon, count, latestDate }: BookCoverProps) {
  // 每种本子的独特配色
  const PALETTE: Record<string, { bg: string; spine: string; accent: string; ring?: string }> = {
    diary:         { bg: "#8b6f47", spine: "#5c4530", accent: "#d4c4a8", ring: "#b8a080" },
    finance:       { bg: "#4a7c59", spine: "#2d5a3d", accent: "#a8d4b8", ring: "#6b9c78" },
    travel:        { bg: "#5b7fa8", spine: "#3d5a7c", accent: "#c4d4e8", ring: "#7a9cc4" },
    plan:          { bg: "#e8dcc4", spine: "#c4b498", accent: "#8b6f47" },
    milestone:     { bg: "#9b7aa8", spine: "#6b4f78", accent: "#f4d466" },
    reading:       { bg: "#6b4423", spine: "#3d2614", accent: "#d4a86b" },
    "yuwen-yueduli": { bg: "#d4c8b0", spine: "#a89880", accent: "#5c4530" },
  };
  const p = PALETTE[templateId] || { bg: "#a89880", spine: "#7a6a54", accent: "#e8dcc4" };

  // 本子标题贴纸颜色
  const labelBg = p.accent;

  // ====== 各本子独特的纹理 SVG ======
  const patterns: Record<string, React.ReactNode> = {
    // 日记 → 皮面 + 缝线十字
    diary: (
      <>
        {/* 皮面纹理（细微噪点） */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <filter id="leather">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
          </filter>
          <rect width="100%" height="100%" filter="url(#leather)" />
        </svg>
        {/* 封面十字缝线（白色虚线） */}
        <div className="absolute top-2 left-2 right-2 bottom-2 rounded-[14px] border border-dashed" style={{ borderColor: p.accent + "80" }} />
        <div className="absolute top-1/2 left-4 right-4 h-px" style={{ background: p.accent + "60" }} />
        <div className="absolute left-1/2 top-4 bottom-4 w-px" style={{ background: p.accent + "60" }} />
      </>
    ),
    // 记账 → 方格纸 + 记账标签
    finance: (
      <>
        {/* 方格纹理 */}
        <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M 12 0 L 0 0 0 12" fill="none" stroke={p.accent} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* 记账标签 */}
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold rotate-6" style={{ background: labelBg, color: p.spine }}>
          FINANCE
        </div>
      </>
    ),
    // 旅行 → 地图纹理 + 飞机/行李箱贴纸
    travel: (
      <>
        {/* 地图经纬线 */}
        <svg className="absolute inset-0 w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="map" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 10 Q 10 5, 0 10" fill="none" stroke={p.accent} strokeWidth="0.6" />
              <path d="M 10 20 Q 5 10, 10 0" fill="none" stroke={p.accent} strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#map)" />
        </svg>
        {/* 飞机贴纸 */}
        <div className="absolute top-3 right-4 text-lg rotate-12">✈️</div>
        {/* 行李箱 */}
        <div className="absolute bottom-3 left-3 text-sm">🧳</div>
      </>
    ),
    // 计划 → 活页横线 + 便签
    plan: (
      <>
        {/* 横线 */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="lines" width="100" height="14" patternUnits="userSpaceOnUse">
              <line x1="0" y1="13" x2="100" y2="13" stroke={p.spine} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lines)" />
        </svg>
        {/* 便签贴纸 */}
        <div className="absolute top-2 right-2 w-10 h-10 rounded-sm shadow-md" style={{ background: "#fef08a", transform: "rotate(8deg)" }} />
      </>
    ),
    // 里程碑 → 金色星点 + 倒计时徽章
    milestone: (
      <>
        {/* 星点背景 */}
        <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle, ${p.accent} 1px, transparent 1px)`, backgroundSize: "14px 14px" }} />
        {/* 倒计时徽章 */}
        <div className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm" style={{ background: p.accent, color: p.spine }}>
          🎯
        </div>
      </>
    ),
    // 读书 → 书页折角 + 书签
    reading: (
      <>
        {/* 书页折角 */}
        <div className="absolute top-0 right-0 w-0 h-0" style={{ borderTop: "24px solid " + p.accent, borderLeft: "24px solid transparent" }} />
        <div className="absolute top-0 right-0 w-0 h-0" style={{ borderTop: "22px solid " + p.bg, borderLeft: "22px solid transparent" }} />
        {/* 书签 */}
        <div className="absolute top-0 left-6 w-2 h-6 rounded-b" style={{ background: "#f87171" }} />
      </>
    ),
    // 阅读理解 → 宣纸 + 毛笔字
    "yuwen-yueduli": (
      <>
        {/* 宣纸纹理 */}
        <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
          <filter id="rice">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" />
          </filter>
          <rect width="100%" height="100%" filter="url(#rice)" />
        </svg>
        {/* 毛笔字装饰 */}
        <div className="absolute top-2 right-3 text-lg opacity-40" style={{ color: p.accent, fontFamily: "serif" }}>阅</div>
      </>
    ),
  };

  return (
    <div className="relative group">
      {/* 立体阴影（右下角偏移） */}
      <div
        className="absolute rounded-xl"
        style={{
          top: "4px",
          left: "4px",
          right: "-4px",
          bottom: "-4px",
          background: p.spine,
          opacity: 0.35,
          zIndex: 0,
        }}
      />

      {/* 书本主体 */}
      <div
        className="relative w-full aspect-[3/4] rounded-[10px] overflow-hidden shadow-md transition-transform group-hover:-translate-y-1 group-hover:shadow-xl"
        style={{ background: p.bg, zIndex: 1 }}
      >
        {/* 书脊 */}
        <BookSpine color={p.spine} />

        {/* 活页螺旋（plan / finance / milestone 用） */}
        {(templateId === "plan" || templateId === "milestone") && (
          <SpiralRings count={7} color={p.ring || p.spine} />
        )}

        {/* 纹理 + 装饰 */}
        <div className="absolute inset-0">
          {patterns[templateId] || patterns.diary}
        </div>

        {/* 本子标题（底部贴纸） */}
        <div className="absolute bottom-2 left-2 right-2 z-20">
          <div
            className="px-2 py-1 rounded text-center shadow-sm"
            style={{
              background: labelBg,
              color: p.spine,
              fontFamily: templateId === "yuwen-yueduli" ? "serif" : "system-ui",
            }}
          >
            <div className="text-[11px] font-semibold leading-tight">{templateName}</div>
            <div className="text-[8px] opacity-70">{icon} {count} 篇</div>
          </div>
        </div>

        {/* 数量徽章（右上角小圆标） */}
        {latestDate && (
          <div
            className="absolute top-1 left-1 z-20 px-1.5 py-0.5 rounded-full text-[8px] font-medium"
            style={{ background: "rgba(255,255,255,0.7)", color: p.spine }}
          >
            📅 {fmtChinese(latestDate)}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// 📱 主页面
// ================================================================

export default function BookShelfPage({ diaries }: Props) {
  const nav = useNavigate();
  const [openedId, setOpenedId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Diary[]>();
    for (const d of diaries) {
      if (d.deletedAt) continue;
      const tid = d.templateId || "diary";
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid)!.push(d);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    }
    const ordered: { id: string; template: typeof TEMPLATES[number]; items: Diary[] }[] = [];
    const seen = new Set<string>();
    for (const tpl of TEMPLATES) {
      if (map.has(tpl.id)) {
        ordered.push({ id: tpl.id, template: tpl, items: map.get(tpl.id)! });
        seen.add(tpl.id);
      }
    }
    for (const [id, items] of map) {
      if (!seen.has(id)) {
        ordered.push({
          id,
          template: { id, name: id, icon: "📒", description: "", defaultBlocks: [] } as typeof TEMPLATES[number],
          items,
        });
      }
    }
    return ordered;
  }, [diaries]);

  const openedBook = groups.find((g) => g.id === openedId);

  // ====== 点开本子：直接打开书本翻页阅读 ======
  if (openedBook) {
    const theme = BOOK_THEMES[openedBook.id] || BOOK_THEMES.diary;
    return (
      <BookReader
        diaries={openedBook.items}
        bookTitle={openedBook.template.name}
        bookIcon={openedBook.template.icon}
        bookTheme={theme}
        onClose={() => setOpenedId(null)}
        onEdit={(id) => nav(`/editor/${id}`)}
      />
    );
  }

  // ====== 书柜主页 ======
  return (
    <div className="min-h-screen bg-paper-bg pb-24">
      <header className="sticky top-0 z-20 bg-paper-bg/85 backdrop-blur-md border-b border-paper-line/60">
        <div className="flex items-center gap-3 px-4 py-3 max-w-xl mx-auto">
          <button
            onClick={() => nav(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-paper-line/40 transition active:scale-95"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-paper-ink" />
          </button>
          <h1 className="text-lg font-semibold text-paper-ink">📚 我的书柜</h1>
          <span className="text-xs text-paper-ink2/60">· {diaries.filter((d) => !d.deletedAt).length} 篇</span>
        </div>
      </header>

      <main className="px-4 pt-6 max-w-xl mx-auto">
        {groups.length === 0 ? (
          <div className="text-center py-20 text-paper-ink2/60">
            <div className="text-5xl mb-4">📚</div>
            <p>还没有任何记录</p>
            <p className="text-xs mt-1">去写一篇吧～</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setOpenedId(g.id)}
                className="group text-left"
              >
                <BookCover
                  templateId={g.id}
                  templateName={g.template.name}
                  icon={g.template.icon}
                  count={g.items.length}
                  latestDate={g.items[0]?.date}
                />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
