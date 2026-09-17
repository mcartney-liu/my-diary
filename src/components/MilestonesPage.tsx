import { useNavigate } from "react-router-dom";
import MilestoneLibrary from "./MilestoneLibrary";

/**
 * 🎈 纪念日首页
 * 从首页导航点进来（和标签、时间胶囊、回收站并列）
 */
export default function MilestonesPage() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-paper-bg pb-10">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-[#faf6ef]/85 border-b border-paper-line/60">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="px-2.5 py-1.5 rounded-full border border-paper-line bg-paper-surface text-sm hover:bg-paper-line/50 transition active:scale-95"
          >
            ← 返回
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎈</span>
            <h1 className="text-paper-ink font-semibold text-lg tracking-wide">纪念日</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5">
        <MilestoneLibrary />
      </main>
    </div>
  );
}
