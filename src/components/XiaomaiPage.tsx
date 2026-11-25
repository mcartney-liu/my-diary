import AiChatView from "./AiChatView";
import BottomDock from "./BottomDock";

// 小麦：从首页的第 4 个 Tab 升级为底栏一级入口（信息架构改版阶段 1）
export default function XiaomaiPage() {
  return (
    <div className="min-h-screen bg-paper-bg pb-28">
      <header className="sticky top-0 z-30 bg-paper-bg/90 backdrop-blur-md border-b border-paper-line/60 px-4 py-3 header-safe">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-paper-ink leading-tight">🌾 小麦</h1>
          <p className="text-xs text-paper-ink2">问问你的日记，或者随便聊聊</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 pt-4">
        <AiChatView />
      </main>
      <BottomDock active="xiaomai" />
    </div>
  );
}
