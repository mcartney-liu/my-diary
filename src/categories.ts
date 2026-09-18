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

// === 关键词兜底推断 ===
// 只有当 category 是 "other_exp" / "other_inc" / 空值 / 不在真源里的 key 时才触发
// 目的：救 AI 快记 / polishTranscript 给错 category 的场

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food:      ["吃", "饭", "餐", "外卖", "奶茶", "咖啡", "早", "午", "晚", "夜宵",
              "火锅", "烧烤", "食堂", "甜品", "蛋糕", "零食", "水果", "买菜", "食材",
              "喝", "下午茶", "饮料", "星巴克", "面", "饺子", "包子", "早餐", "午餐", "晚餐"],
  transport: ["地铁", "公交", "打车", "滴滴", "出租", "高铁", "火车", "机票", "飞机",
              "加油", "停车", "过路费", "洗车", "单车", "交通", "机票", "出行", "高速"],
  shopping:  ["买", "购物", "超市", "淘宝", "京东", "拼夕夕", "商场", "网购", "快递",
              "衣服", "鞋", "包", "化妆品", "日用", "消费", "唯品会", "拼多多"],
  home:      ["房租", "水电", "物业", "燃气", "网费", "房贷", "维修", "家居", "家电", "装修"],
  entertain: ["电影", "游戏", "ktv", "旅游", "门票", "健身", "运动", "音乐",
              "演出", "会所", "漫画", "追剧", "视频会员"],
  study:     ["书", "课程", "培训", "学费", "考试", "学习", "网课", "教辅"],
  medical:   ["医院", "药", "看病", "体检", "挂号", "治疗", "医疗"],
  travel:    ["旅行", "旅游", "酒店", "民宿", "景点"],
  gift:      ["礼物", "送", "生日", "随份子", "红包给"],
  salary:    ["工资", "薪资", "发薪", "月薪", "收入", "到账", "发工资"],
  bonus:     ["奖金", "红包", "补贴", "报销", "利息", "分红", "福利"],
  side:      ["副业", "兼职", "外快"],
  invest:    ["理财", "基金", "股票", "投资", "存款利息"],
};

// 历史遗留错误 key → 真源 key 的映射（兼容旧数据）
const LEGACY_KEY_MAP: Record<string, string> = {
  other:    "other_exp",    // 旧版 FinancePage 和 AI 都给过 "other"
  housing:  "home",         // FinancePage 自造的错误 key
  "餐饮":   "food",         // AI 有时给中文
  "交通":   "transport",
  "购物":   "shopping",
  "娱乐":   "entertain",
  "工资":   "salary",
  "奖金":   "bonus",
};

/**
 * 归一化 category key：
 * 1. 先跑关键词推断（hintText 里有 "吃饭/打车/购物" 之类就直接命中对应分类）
 *    — 优先于 AI 给的 category（AI 经常给 "other" 而 content 明明有线索）
 * 2. 历史遗留错 key 映射（housing→home, 中文→英文 key）
 * 3. 真源校验（不是真源 key 也跑关键词推断兜底）
 */
export function resolveCategory(
  cat: string | undefined | null,
  direction: "expense" | "income",
  hintText: string = ""
): string {
  // 🔑 优先关键词推断 — 就算 AI 给了 category 也先看 hintText 有没有线索
  // 只有当 AI 给的 category 是 "有效且明确的真源 key"（比如 "food"、"salary"）时才信任 AI
  // 如果 AI 给的是 "other"/"other_exp"/空/无效 key → 跑关键词推断
  const otherKeys = new Set(["other", "other_exp", "other_inc", ""]);
  const needInfer = !cat || otherKeys.has(cat) || !FINANCE_CATEGORIES.some((c) => c.key === cat);

  if (needInfer) {
    const inferred = inferFromKeywords(direction, hintText);
    // 关键词命中了非 other 的分类 → 用关键词结果
    const inferredMeta = FINANCE_CATEGORIES.find((c) => c.key === inferred);
    if (inferredMeta && !inferredMeta.key.startsWith("other")) {
      return inferred;
    }
    // 关键词没命中 → fallback 到 AI 给的（如果是其他历史遗留 key 映射后）
    const mapped = LEGACY_KEY_MAP[cat ?? ""];
    return mapped ?? inferred;
  }

  // AI 给的是有效真源 key → 信任
  return cat;
}

function inferFromKeywords(direction: "expense" | "income", hintText: string): string {
  const fallbackKey = direction === "income" ? "other_inc" : "other_exp";
  if (!hintText) return fallbackKey;

  const text = hintText.toLowerCase();
  // 按关键词数量降序排列（匹配越具体的越优先）
  const sortedEntries = Object.entries(CATEGORY_KEYWORDS).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [key, words] of sortedEntries) {
    // 收入类关键词只在 direction=income 时考虑，支出类同理
    const catMeta = FINANCE_CATEGORIES.find((c) => c.key === key);
    if (catMeta && catMeta.direction !== direction) continue;

    for (const w of words) {
      if (text.includes(w.toLowerCase())) return key;
    }
  }
  return fallbackKey;
}

/** 根据 category key 查图标/名称（兼容历史遗留） */
export function categoryMeta(key: string): FinanceCategory {
  const mapped = LEGACY_KEY_MAP[key] ?? key;
  return categoryByKey(mapped) ?? FINANCE_CATEGORIES[0];
}
