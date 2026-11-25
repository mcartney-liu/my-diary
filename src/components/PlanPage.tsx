import PlanLibrary from "./PlanLibrary";
import PageHeader from "./PageHeader";

/**
 * 🎯 计划首页
 * 从首页导航点进来（和标签、纪念日、时间胶囊、回收站并列）
 */
export default function PlanPage() {

  return (
    <div className="min-h-screen bg-paper-bg pb-10">
      <PageHeader title="🎯 计划" />

      <main className="max-w-3xl mx-auto px-4 pt-5">
        <PlanLibrary />
      </main>
    </div>
  );
}
