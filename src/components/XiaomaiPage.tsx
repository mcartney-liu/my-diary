import AiChatView from "./AiChatView";
import BottomDock from "./BottomDock";

// 小麦：底栏一级入口。对话区铺满整页，输入框固定在底栏上方
export default function XiaomaiPage() {
  return (
    <div className="xiaomai-page bg-paper-bg flex flex-col">
      <header className="shrink-0 bg-paper-bg/90 backdrop-blur-md header-safe">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-1">
          <h1 className="text-[26px] font-bold text-paper-ink leading-tight tracking-wide">小麦</h1>
        </div>
      </header>
      {/* 给浮动底栏留位置：底栏高度 + 离底距离 + 安全区（见 index.css .dock-space） */}
      <main className="flex-1 min-h-0 w-full max-w-2xl mx-auto dock-space">
        <AiChatView />
      </main>
      <BottomDock active="xiaomai" />
    </div>
  );
}
