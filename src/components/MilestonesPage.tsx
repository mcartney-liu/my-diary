﻿﻿﻿﻿﻿import MilestoneLibrary from "./MilestoneLibrary";
import PageHeader from "./PageHeader";

/**
 * 🎈 纪念日首页
 * 从首页导航点进来（和标签、时间胶囊、回收站并列）
 */
export default function MilestonesPage() {

  return (
    <div className="min-h-screen bg-paper-bg pb-10">
      {/* 顶部导航 */}
      <PageHeader title="🎈 纪念日" />

      <main className="max-w-3xl mx-auto px-4 pt-5">
        <MilestoneLibrary />
      </main>
    </div>
  );
}
