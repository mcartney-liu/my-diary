import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// 二级页面统一头部：返回箭头 + 标题 + 右侧操作
// 之前 回收站 / 标签 / 胶囊 / 记账 用「←图标」，纪念日 / 计划 / 资料库 用「← 返回」文字按钮，
// 背景色写死 #faf6ef（切到森林 / 月光主题会露出米黄色），高度和字号也各不相同
export default function PageHeader({ title, subtitle, onBack, backTo, right }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  /** 没有 onBack 时：有 backTo 就跳过去，否则返回上一页 */
  backTo?: string;
  right?: ReactNode;
}) {
  const nav = useNavigate();
  const back = onBack ?? (() => (backTo ? nav(backTo, { replace: true }) : nav(-1)));
  return (
    <header className="sticky top-0 z-30 bg-paper-bg/90 backdrop-blur-md border-b border-paper-line/60 header-safe">
      <div className="max-w-2xl mx-auto px-2 h-14 flex items-center gap-1">
        <button type="button" onClick={back} aria-label="返回" className="btn-ghost w-10 h-10 shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-paper-ink truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-paper-ink2 truncate -mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0 flex items-center gap-1.5 pr-2">{right}</div>}
      </div>
    </header>
  );
}
