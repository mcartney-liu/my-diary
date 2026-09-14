// 日记模板 — 每种模板是一套预设初始值
// EditorPage 零改动，模板只是"给新建日记一个不同的初始 state"

import type { DiaryBlock, MoodId } from "./types";
import { uid } from "./types";

export interface DiaryTemplate {
  id: string;
  name: string;
  icon: string;              // emoji 图标
  description: string;       // 副标题
  defaultBlocks: DiaryBlock[];
  wallpaper?: string;        // 预设信纸（空/undefined=CSS 默认）
  showLines?: boolean;       // 默认 false（无横线纯纸）
  defaultTags?: string[];
  defaultTitle?: string;
  defaultMoodId?: MoodId;
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
    defaultTitle: "📖 今日日记",
    defaultMoodId: "calm",
    showLines: true,
  },
  {
    id: "finance",
    name: "记账",
    icon: "💰",
    description: "多条流水 + 分类 + 自动计算",
    defaultBlocks: [
      heading("💰 今日流水", 2),
      fi("expense", "food", 0, ""),
      fi("income", "salary", 0, ""),
      divider(),
      heading("备注", 3),
      tb(""),
    ],
    showLines: false,
    defaultTitle: "💰 今日记账",
    defaultMoodId: "calm",
    defaultTags: ["记账"],
  },
  {
    id: "reading",
    name: "读书",
    icon: "📚",
    description: "进度 + 摘抄 + 感悟",
    defaultBlocks: [
      heading("📚 《书名》", 2),
      heading("作者", 3),
      tb(""),
      numField("已读页数", "页"),
      divider(),
      heading("🌟 摘抄", 3),
      tb(""),
      divider(),
      heading("💡 感悟", 3),
      tb(""),
    ],
    wallpaper: "/papers/sage-journal.jpg",
    showLines: false,
    defaultTitle: "📚 读书笔记",
    defaultMoodId: "calm",
    defaultTags: ["读书"],
  },
  {
    id: "travel",
    name: "旅行",
    icon: "✈️",
    description: "自动定位 + 附近推荐 + 结构化记录",
    defaultBlocks: [
      heading("✈️ Day 1 · 今日亮点", 2),
      numField("心情", "/10"),
      divider(),
      heading("📍 我在做什么", 3),
      check("早上做了什么？"),
      check("下午逛了哪里？"),
      check("晚上有什么安排？"),
      divider(),
      heading("🍜 美食记忆", 3),
      numField("今天花了", "¥"),
      tb("今天吃了什么？味道如何？"),
      divider(),
      heading("📝 今日故事", 3),
      tb(""),
      divider(),
      heading("💡 今日小发现", 3),
      tb("有没有遇到有趣的人、意外的惊喜、想分享的事？"),
    ],
    wallpaper: "/papers/sunrise-dream.jpg",
    showLines: false,
    defaultTitle: "✈️ 旅行日记",
    defaultMoodId: "happy",
    defaultTags: ["旅行"],
  },
  {
    id: "sports",
    name: "运动",
    icon: "🏃",
    description: "时长 + 距离 + 感受",
    defaultBlocks: [
      heading("🏃 今日运动", 2),
      heading("类型", 3),
      tb("跑步 / 瑜伽 / 健身 / 骑行 ..."),
      divider(),
      numField("时长", "分钟"),
      numField("距离", "km"),
      divider(),
      heading("💪 感受", 3),
      tb(""),
      heading("🤕 身体不适", 3),
      tb("（可选）"),
    ],
    defaultTitle: "🏃 运动记录",
    defaultMoodId: "happy",
    showLines: false,
    defaultTags: ["运动"],
  },
  {
    id: "plan",
    name: "每日计划",
    icon: "🎯",
    description: "必做 3 件 + 可选",
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
      heading("⏰ 备注", 3),
      tb(""),
    ],
    defaultTitle: "🎯 今日计划",
    defaultMoodId: "calm",
    showLines: false,
    defaultTags: ["计划"],
  },
  {
    id: "gratitude",
    name: "感恩日记",
    icon: "🙏",
    description: "3 段感恩 + 明天",
    defaultBlocks: [
      heading("🙏 今日感恩", 2),
      heading("1. 今天感谢什么？", 3),
      tb(""),
      heading("2. 为什么？", 3),
      tb(""),
      heading("3. 这件事让我感受如何？", 3),
      tb(""),
      divider(),
      heading("✨ 明天想感恩什么？", 3),
      tb(""),
    ],
    wallpaper: "/papers/vintage-rose.jpg",
    showLines: false,
    defaultTitle: "🙏 感恩日记",
    defaultMoodId: "happy",
    defaultTags: ["感恩"],
  },
  {
    id: "health",
    name: "健康记录",
    icon: "💊",
    description: "体重 + 睡眠 + 心情",
    defaultBlocks: [
      heading("💊 今日健康", 2),
      numField("体重", "kg"),
      numField("睡眠", "小时"),
      numField("喝水", "杯"),
      divider(),
      heading("🤒 身体信号", 3),
      tb("头痛 / 疲惫 / 放松 / 活力 ..."),
      heading("😊 今日心情 (1-10)", 3),
      numField("心情", "分"),
    ],
    defaultTitle: "💊 健康日记",
    defaultMoodId: "calm",
    showLines: false,
    defaultTags: ["健康"],
  },
];

export function templateById(id?: string): DiaryTemplate | undefined {
  if (!id) return undefined;
  return TEMPLATES.find((t) => t.id === id);
}
