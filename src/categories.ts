// 记账分类数据

export interface FinanceCategory {
  key: string;
  icon: string;
  name: string;
  direction: "expense" | "income";
}

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  // 支出
  { key: "food",        icon: "🍜", name: "餐饮",   direction: "expense" },
  { key: "transport",   icon: "🚗", name: "交通",   direction: "expense" },
  { key: "shopping",    icon: "🛒", name: "购物",   direction: "expense" },
  { key: "study",       icon: "📚", name: "学习",   direction: "expense" },
  { key: "entertain",   icon: "🎮", name: "娱乐",   direction: "expense" },
  { key: "medical",     icon: "💊", name: "医疗",   direction: "expense" },
  { key: "home",        icon: "🏠", name: "居家",   direction: "expense" },
  { key: "travel",      icon: "✈️", name: "旅行",   direction: "expense" },
  { key: "gift",        icon: "🎁", name: "礼物",   direction: "expense" },
  { key: "other_exp",   icon: "💼", name: "其他",   direction: "expense" },
  // 收入
  { key: "salary",      icon: "💰", name: "工资",   direction: "income" },
  { key: "bonus",       icon: "🎁", name: "红包",   direction: "income" },
  { key: "side",        icon: "💼", name: "副业",   direction: "income" },
  { key: "invest",      icon: "📈", name: "理财",   direction: "income" },
  { key: "other_inc",   icon: "✨", name: "其他",   direction: "income" },
];

export function categoryByKey(key?: string, dir?: "expense" | "income"): FinanceCategory | undefined {
  if (!key) {
    // 给默认分类
    return dir === "income"
      ? FINANCE_CATEGORIES.find((c) => c.key === "salary")
      : FINANCE_CATEGORIES.find((c) => c.key === "food");
  }
  return FINANCE_CATEGORIES.find((c) => c.key === key);
}

export function categoriesByDir(dir: "expense" | "income"): FinanceCategory[] {
  return FINANCE_CATEGORIES.filter((c) => c.direction === dir);
}
