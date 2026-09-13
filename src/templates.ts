// 日记模板 — 每种模板是一套预设初始值
// EditorPage 零改动，模板只是"给新建日记一个不同的初始 state"

import type { DiaryBlock } from "./types";
import { uid } from "./types";

export interface DiaryTemplate {
  id: string;
  name: string;
  icon: string;              // emoji 图标
  description: string;       // 副标题
  defaultBlocks: DiaryBlock[];
  wallpaper?: string;        // 预设信纸（空/undefined=CSS 默认）
  showLines?: boolean;       // 默认 true
  defaultTags?: string[];
}

function tb(content: string): DiaryBlock {
  return { id: uid("b"), kind: "text", content };
}
function heading(content: string, level: 1 | 2 | 3 = 2): DiaryBlock {
  return { id: uid("b"), kind: "heading", content, level };
}
function numField(label: string, unit?: string, value?: number): DiaryBlock {
  return { id: uid("b"), kind: "number", content: "", label, unit, value };
}
function divider(): DiaryBlock {
  return { id: uid("b"), kind: "divider", content: "" };
}
function check(content: string, checked = false): DiaryBlock {
  return { id: uid("b"), kind: "checkbox", content, checked };
}
function fi(direction: "expense" | "income", category: string, value = 0, content = ""): DiaryBlock {
  return { id: uid("f"), kind: "finance_item", content, direction, category, value };
}

export const TEMPLATES: DiaryTemplate[] = [
  {
    id: "diary",
    name: "日记",
    icon: "📖",
    description: "每天最自然的记录",
    defaultBlocks: [tb("")],
    // 不设 wallpaper → CSS 默认米白 + 横线
  },
  {
    id: "finance",
    name: "记账",
    icon: "💰",
    description: "多条流水 + 分类 + 自动计算",
    defaultBlocks: [
      heading("💰 今日流水", 2),
      fi("expense", "food", 38, "午餐"),
      fi("expense", "transport", 15, "打车"),
      fi("income", "salary", 0, "工资"),
      divider(),
      heading("备注", 3),
      tb(""),
    ],
    showLines: true,
    defaultTags: ["记账"],
  },
  {
    id: "reading",
    name: "读书",
    icon: "📚",
    description: "摘抄 + 感悟",
    defaultBlocks: [
      heading("📚 《书名》", 2),
      heading("作者：", 3),
      numField("进度", "页"),
      divider(),
      heading("🌟 摘抄", 3),
      tb(""),
      divider(),
      heading("💡 感悟", 3),
      tb(""),
    ],
    wallpaper: "/papers/sage-journal.jpg",
    showLines: true,
    defaultTags: ["读书"],
  },
  {
    id: "travel",
    name: "旅行",
    icon: "✈️",
    description: "把旅程完整记下来",
    defaultBlocks: [tb("✈️ Day 1\n📍 地点：\n🚗 交通：\n🏨 住宿：\n\n📝 今天发生了什么？\n\n🍜 美食：\n📸 照片：")],
    wallpaper: "/papers/sunrise-dream.jpg",
    showLines: true,
    defaultTags: ["旅行"],
  },
  {
    id: "sports",
    name: "运动",
    icon: "🏃",
    description: "身体在说什么",
    defaultBlocks: [tb("🏃 今日运动\n类型：跑步 / 瑜伽 / 健身\n时长：\n强度：★ / ★★ / ★★★\n\n\n💪 感受：\n身体哪个部位有变化？")],
    defaultTags: ["运动"],
  },
  {
    id: "plan",
    name: "每日计划",
    icon: "🎯",
    description: "三问今天做什么",
    defaultBlocks: [
      heading("🎯 今日目标", 2),
      heading("✅ 必做 3 件", 3),
      check(""),
      check(""),
      check(""),
      divider(),
      heading("📌 可选", 3),
      check(""),
      check(""),
      divider(),
      heading("⏰ 时间分配 / 备注", 3),
      tb(""),
    ],
    defaultTags: ["计划"],
  },
  {
    id: "gratitude",
    name: "感恩日记",
    icon: "🙏",
    description: "三件感恩的小事",
    defaultBlocks: [tb("🙏 今日感恩\n\n1. 今天感谢谁 / 什么？\n2. 为什么？\n3. 这件事让我感受如何？\n\n4. 明天想感谢什么？")],
    wallpaper: "/papers/vintage-rose.jpg",
    showLines: true,
    defaultTags: ["感恩"],
  },
  {
    id: "health",
    name: "健康记录",
    icon: "💊",
    description: "身体信号 + 心情",
    defaultBlocks: [tb("💊 健康日记\n体重：__ kg\n睡眠：__/__ 小时\n💧 喝水：__ 杯\n运动：\n\n🤒 身体信号：\n心情：1-10")],
    defaultTags: ["健康"],
  },
];

export function templateById(id?: string): DiaryTemplate | undefined {
  if (!id) return undefined;
  return TEMPLATES.find((t) => t.id === id);
}
