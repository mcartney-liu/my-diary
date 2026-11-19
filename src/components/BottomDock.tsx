import { useNavigate } from "react-router-dom";
import { User, PenLine, LibraryBig, Home } from "lucide-react";
import { peek } from "../dataCache";
import VoiceQuickEntry from "./VoiceQuickEntry";

export type DockTab = "home" | "diaries" | "shelf" | "profile";

// 底栏常驻的四个入口 + 中间语音快记
// 为什么抽成组件：原来这段只硬编码在 CalendarPage 里，导致进「书柜 / 日记 / 我的」
// 之后底栏消失，用户得点返回才能回到有底栏的页面 —— 不符合移动端 Tab 习惯。
// 顺序按移动端习惯：首页 → 书柜 →（中间麦克风）→ 日记 → 我的
const SHELF_ITEM = { tab: "shelf", path: "/shelf", label: "书柜" } as const;
const DIARIES_ITEM = { tab: "diaries", path: "/diaries", label: "日记" } as const;

function avatarSrc(key: string) {
  if (key.startsWith("http")) return key;
  return `/avatars/${key}.jpg`;
}

export default function BottomDock({
  active,
  avatarKey,
}: {
  active: DockTab;
  avatarKey?: string | null;
}) {
  const nav = useNavigate();
  // 头像没显式传时，从缓存里取（各页不必各自维护一份 avatar state，图标保持一致）
  const shownAvatar = avatarKey ?? (peek<any>("profile")?.user?.avatar ?? null);

  const itemCls = (tab: DockTab) =>
    `flex flex-col items-center justify-center h-10 text-[10px] font-medium transition-colors active:scale-95 px-2 rounded-full shrink-0 whitespace-nowrap min-w-[44px] ${
      active === tab
        ? "text-paper-ink bg-paper-line/40"
        : "text-paper-ink2 hover:text-paper-ink hover:bg-paper-line/40"
    }`;

  // 点当前 Tab 不再压栈（否则反复点会把历史堆成一串）
  const go = (tab: DockTab, path: string) => {
    if (tab === active) return;
    nav(path);
  };

  return (
    <nav
      aria-label="主导航"
      className="fixed dock-safe left-1/2 -translate-x-1/2 z-40 rounded-full bg-paper-surface/90 backdrop-blur-md border border-paper-line/80 px-2 py-1.5 shadow-lg shadow-paper-ink/5 max-w-[calc(100vw-1rem)]"
    >
      <div className="flex items-center gap-1.5">
        {/* 首页（日历）—— 之前漏了这一项，导致进了「我的 / 书柜 / 日记」就回不到首页 */}
        <button
          id="tour-dock-home"
          type="button"
          onClick={() => go("home", "/")}
          aria-current={active === "home" ? "page" : undefined}
          className={itemCls("home")}
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="leading-none mt-0.5">首页</span>
        </button>

        {/* 书柜 */}
        <button
          id="tour-dock-shelf"
          type="button"
          onClick={() => go(SHELF_ITEM.tab, SHELF_ITEM.path)}
          aria-current={active === "shelf" ? "page" : undefined}
          className={itemCls("shelf")}
        >
          <LibraryBig className="w-4 h-4 shrink-0" />
          <span className="leading-none mt-0.5">{SHELF_ITEM.label}</span>
        </button>

        {/* 🎤 语音快记（中心强调胶囊）—— 各 Tab 都保留，底栏形态保持一致 */}
        <span id="tour-dock-voice" className="inline-flex">
          <VoiceQuickEntry dockVariant />
        </span>

        {/* 日记 */}
        <button
          id="tour-dock-write"
          type="button"
          onClick={() => go(DIARIES_ITEM.tab, DIARIES_ITEM.path)}
          aria-current={active === "diaries" ? "page" : undefined}
          className={itemCls("diaries")}
        >
          <PenLine className="w-4 h-4 shrink-0" />
          <span className="leading-none mt-0.5">{DIARIES_ITEM.label}</span>
        </button>

        {/* 我的 */}
        <button
          id="tour-dock-profile"
          type="button"
          onClick={() => go("profile", "/profile")}
          aria-current={active === "profile" ? "page" : undefined}
          className={itemCls("profile")}
        >
          {shownAvatar?.startsWith("emoji-") ? (
            <span className="w-5 h-5 rounded-full border border-paper-line shrink-0 flex items-center justify-center text-sm bg-gradient-to-br from-amber-100 to-paper-surface">
              {shownAvatar.slice(6)}
            </span>
          ) : shownAvatar ? (
            <img
              src={avatarSrc(shownAvatar)}
              alt="头像"
              className="block w-5 h-5 rounded-full object-cover border border-paper-line shrink-0"
            />
          ) : (
            <User className="w-4 h-4 shrink-0" />
          )}
          <span className="leading-none mt-0.5">我的</span>
        </button>
      </div>
    </nav>
  );
}
