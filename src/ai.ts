/**
 * AI Service — 统一大模型入口
 *
 * 架构：
 *   Provider 抽象 → 支持多家 API（豆包/通义/GPT/其他）
 *   Skills → 7 个 AI 场景，每个场景有独立 Prompt 模板
 *   Prompt 模板 → 按模板类型差异化（旅行/读书/记账...）
 *
 * 使用：
 *   1. 用户在设置页填 endpoint + model + apiKey → 存 localStorage
 *   2. 代码调用 ai.polishTranscript(raw, templateId, ctx) → 返回结构化 blocks
 */

import type { DiaryBlock, MoodId } from "./types";
import { uid } from "./types";

// ============================================================
// Provider 层 — 抽象大模型 API 差异
// ============================================================

export interface AiProvider {
  name: string;
  endpoint: string;        // 完整 URL
  model: string;
  apiKey: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callChatCompletion(
  provider: AiProvider,
  messages: AiMessage[],
  temperature = 0.7
): Promise<string> {
  // 🔑 8 秒超时 — 手机网络差时不能无限等
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`AI ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    // 兼容 OpenAI / 豆包 / 通义 标准格式
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      data?.output?.text ??
      "";
    if (!text) throw new Error("AI 返回为空");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Provider 管理 — localStorage 持久化
// ============================================================

const STORAGE_KEY = "mydiary.ai.provider";

// 内置默认 Provider，永不丢失
const DEFAULT_PROVIDER: AiProvider = {
  name: "Agnes",
  endpoint: "https://api.agnes-ai.cn/v1/chat/completions",
  model: "agnes-3.0-flash",
  apiKey: "sk-vgf79jNxIWOstqrYhcU5FLBV3V67jpSfRaBnSHKDwNb2UOQ4",
};

export function getAiProvider(): AiProvider {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AiProvider;
      if (p && p.apiKey) {
        return p;
      }
    }
  } catch {}
  // fallback：返回内置默认值
  return DEFAULT_PROVIDER;
}

export function saveAiProvider(p: AiProvider) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearAiProvider() {
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================================
// Skills — 7 个 AI 场景
// ============================================================

export interface PolishContext {
  templateId: string;
  location?: string;          // "保定市 · 莲池区"
  weather?: string;           // "21° 晴"
  nearbyPois?: string[];      // ["直隶总督署", "古莲花池"]
  date?: string;              // "2026-09-14"
}

export interface AiBlockResult {
  kind: DiaryBlock["kind"];
  content: string;
  level?: 1 | 2 | 3;
  label?: string;
  value?: number;
  unit?: string;
  checked?: boolean;
  direction?: "expense" | "income";
  category?: string;
}

export interface PolishResult {
  title?: string;
  blocks: AiBlockResult[];
  mood?: MoodId;
  tags?: string[];
}

/**
 * Skill 0: 语音转写文字纠错（Web Speech API 常见同音字/错别字修正）
 * 没 provider 就直接返回原文（零依赖兜底）
 */
export async function correctTranscript(
  rawText: string,
  provider?: AiProvider | null
): Promise<string> {
  if (!rawText?.trim()) return rawText;

  const p = provider ?? getAiProvider();
  if (!p) return rawText; // 🔑 没 key → 跳过，直接返回原文

  try {
    const raw = await callChatCompletion(p, [
      {
        role: "system",
        content: `你是中文语音转写纠错助手。Web Speech API 经常把同音词识别错（如"梅菜扣肉"→"没菜扣肉"、"故宫"→"故公"、"打车"→"打居"）。
你的任务：修正明显的错别字和同音字错误，但不要改写用户原意，不要润色，不要加标点以外的东西。
直接返回修正后的文字，不要解释。`,
      },
      { role: "user", content: rawText },
    ], 0.1); // 低温度 = 保守修正，不瞎发挥
    const fixed = raw.trim();
    return fixed || rawText;
  } catch {
    return rawText; // 🔑 AI 挂了也兜底，返回原文
  }
}

/** 清洗 AI 可能乱扔的英文字段名 —— AI 偶尔会把 JSON schema 写进 content 里 */
function normalizeBlock(b: AiBlockResult): AiBlockResult {
  // content 里可能有: "direction: expense, category: food, value: 5, 梅菜扣肉饼"
  // 先从 content 里提取已知字段
  const cleaned = { ...b };
  if (typeof cleaned.content === "string") {
    const c = cleaned.content;
    // 提取 direction
    const dirMatch = c.match(/direction\s*[:：]\s*(expense|income)/i);
    if (dirMatch && !cleaned.direction) cleaned.direction = dirMatch[1].toLowerCase() as any;
    // 提取 category
    const catMatch = c.match(/category\s*[:：]\s*(\w+)/i);
    if (catMatch && !cleaned.category) cleaned.category = catMatch[1].toLowerCase();
    // 提取 value
    const valMatch = c.match(/value\s*[:：]\s*(\d+)/i);
    if (valMatch && !cleaned.value) cleaned.value = Number(valMatch[1]);
    // 提取 checked
    const checkedMatch = c.match(/checked\s*[:：]\s*(true|false)/i);
    if (checkedMatch && cleaned.checked === undefined) cleaned.checked = checkedMatch[1] === "true";
    // 提取 level
    const levelMatch = c.match(/level\s*[:：]\s*(\d)/i);
    if (levelMatch && !cleaned.level) cleaned.level = Number(levelMatch[1]) as any;
    // 清理 content — 去掉所有 "字段名: 值" 片段
    cleaned.content = c
      .replace(/\b(direction|category|value|checked|level|label|unit|kind)\s*[:：][^,，。;；\n]*[,，。;；\n]*/gi, "")
      .replace(/[,，]\s*[,，]+/g, "，")
      .replace(/^[,，。;；\s]+|[,，。;；\s]+$/g, "")
      .trim();
  }
  // 如果 content 被清光了但有其他字段，设个合理默认
  if (!cleaned.content || cleaned.content.length === 0) {
    if (cleaned.kind === "finance_item") cleaned.content = "备注";
    if (cleaned.kind === "heading") cleaned.content = "标题";
    if (cleaned.kind === "checkbox") cleaned.content = "待办";
    if (cleaned.kind === "number") cleaned.content = "";
  }
  return cleaned;
}

/**
 * Skill 1: 录音转写 → 润色填充到模板
 * 用户录音原始文字 + 当前模板 → 结构化 blocks
 */
export async function polishTranscript(
  rawText: string,
  ctx: PolishContext,
  provider?: AiProvider | null
): Promise<PolishResult> {
  const p = provider ?? getAiProvider();

  // 🔴 AI 不可用 → 立即走规则降级（毫秒级，零网络）
  if (!p) return ruleBasedPolish(rawText, ctx);

  const systemPrompt = POLISH_SYSTEM_PROMPTS[ctx.templateId] ?? POLISH_SYSTEM_PROMPTS.default;

  const contextParts = [
    `模板类型: ${TEMPLATE_NAMES[ctx.templateId] ?? ctx.templateId}`,
    ctx.date ? `日期: ${ctx.date}` : null,
    ctx.location ? `GPS 位置: ${ctx.location}` : null,
    ctx.weather ? `天气: ${ctx.weather}` : null,
    ctx.nearbyPois?.length ? `附近 POI: ${ctx.nearbyPois.join("、")}` : null,
  ].filter(Boolean);

  const userPrompt = `${contextParts.join("\n")}

---
用户录音原始文字:
${rawText || "(无内容)"}

---
请把这段原始文字润色后，填充到对应模板结构里。
要求:
1. **先修正同音字/错别字**（Web Speech API 经常把"故宫"识别成"故公"、"梅菜扣肉"识别成"没菜扣肉"、"打车"识别成"打居"，先改对再往下做）
2. 保持用户真实经历，不要编造
3. 口语化的转写可以适当整理，但保留用户的语气
4. **必须返回 title 字段**！这是日记标题，emoji 开头 + 一句话（≤15字）
5. 返回严格 JSON，格式见 system prompt
6. heading 块用 kind:"heading" + level (1/2/3)
7. checkbox 块用 kind:"checkbox" + checked:true/false
8. number 块用 kind:"number" + label + unit + value
9. divider 块用 kind:"divider" + content:""
10. 普通正文用 kind:"text"
`;

  try {
    const raw = await callChatCompletion(p, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    // 解析 AI 返回的 JSON
    const json = extractJson(raw);
    const result = JSON.parse(json) as PolishResult;
    // 补 id + 清洗 AI 可能乱扔的字段名
    return {
      ...result,
      blocks: result.blocks
        .map((b) => ({ ...b, id: uid("b") } as AiBlockResult))
        .map(normalizeBlock),
      title: result.title?.replace(/direction\s*[:：][^,，。;；]+[,，。;；]*/gi, "")
                          .replace(/category\s*[:：][^,，。;；]+[,，。;；]*/gi, "")
                          .replace(/value\s*[:：][^,，。;；]+[,，。;；]*/gi, "")
                          .replace(/checked\s*[:：][^,，。;；]+[,，。;；]*/gi, "")
                          .trim() || result.title,
      // 🔑 mood/tags 兜底：AI 可能没返回或返回无效值 → 先用关键词匹配，不行才 calm
      mood: VALID_MOODS.includes(result.mood as MoodId)
        ? result.mood as MoodId
        : detectMoodByKeywords(rawText),
      tags: result.tags?.length ? result.tags : (({ travel:["旅行"], finance:["记账"], reading:["阅读"], plan:["计划"], health:["健康"], gratitude:["感恩"], sports:["运动"], diary:["日记"] } as Record<string, string[]>)[ctx.templateId] ?? ["日记"]),
    };
  } catch (e) {
    // 🔴 AI 失败（超时/网络/解析错误）→ 规则降级，永不挂起
    console.warn("[polishTranscript] AI failed, falling back to rule-based:", (e as Error).message);
    return ruleBasedPolish(rawText, ctx);
  }
}

/**
 * 🧮 纯算法情绪检测 — 关键词匹配，稳定可靠，零成本
 * AI 路径失败或 mood 格式不对时的兜底
 */
export function detectMoodByKeywords(text: string): MoodId {
  if (!text?.trim()) return "calm";
  const moodKeywords: Record<MoodId, string[]> = {
    happy:   ["开心","高兴","快乐","爽","棒","好","喜欢","爱","期待","兴奋","幸福","棒极了","哈哈","嘻嘻","nice","happy"],
    sad:     ["难过","伤心","哭","泪","失落","沮丧","郁闷","委屈","唉","sad"],
    angry:   ["生气","愤怒","烦","讨厌","气人","可恶","该死","气死"],
    anxious: ["焦虑","紧张","担心","害怕","不安","慌","压力","怕","anxious"],
    calm:    ["平静","放松","舒服","悠闲","享受","静静"],
  };
  let bestMood: MoodId = "calm";
  let bestScore = 0;
  for (const [m, kws] of Object.entries(moodKeywords)) {
    let score = 0;
    for (const kw of kws) if (text.includes(kw)) score += 1;
    if (score > bestScore) { bestScore = score; bestMood = m as MoodId; }
  }
  return bestMood;
}

const VALID_MOODS: MoodId[] = ["happy", "calm", "sad", "angry", "anxious"];

/**
 * 规则降级 — AI 挂了时用，毫秒级返回合理的 blocks + title
 * 核心思想：规则匹配已经能选对模板了，再用规则生成合理的结构化内容
 */
function ruleBasedPolish(rawText: string, ctx: PolishContext): PolishResult {
  const text = rawText.trim();
  const tplName = TEMPLATE_NAMES[ctx.templateId] ?? "日记";

  // 生成标题：取前 10 字 + emoji
  const titleEmoji: Record<string, string> = {
    finance: "💰", travel: "✈️", reading: "📖", plan: "📋",
    health: "💪", gratitude: "🙏", sports: "🏃", default: "📝",
    diary: "📝",
  };
  const emoji = titleEmoji[ctx.templateId] ?? "📝";
  let title = text.length > 10 ? text.slice(0, 10) + "..." : text;
  if (!title) title = tplName;
  title = `${emoji} ${title}`;

  // 检测金额（"花了5块"、"支出 50 元"、"60块"等）
  const moneyRe = /(?:花了|支出|收入|付了|买了|花|¥|￥)?\s*(\d+(?:\.\d+)?)\s*(?:块|元|块钱|rmb)?/gi;
  const moneys: { value: number; content: string }[] = [];
  let mm;
  while ((mm = moneyRe.exec(text)) !== null) {
    const v = Number(mm[1]);
    if (v > 0 && v < 100000) {
      const before = text.slice(Math.max(0, mm.index - 6), mm.index).trim();
      const after = text.slice(mm.index + mm[0].length, Math.min(text.length, mm.index + mm[0].length + 8)).trim();
      const content = (before + after).replace(/[，。！？,.]/g, "").trim() || "支出";
      moneys.push({ value: v, content });
    }
  }

  // 检测待办（"要去XX"、"打算XX"、"明天XX"）
  const todoRe = /(?:要|打算|明天|后天|周末|下周|得)\s*([^，。！？,.;；\n]{2,15})/g;
  let tm;
  const todos: string[] = [];
  while ((tm = todoRe.exec(text)) !== null) {
    todos.push(tm[1]);
  }

  // 构建 blocks
  const blocks: AiBlockResult[] = [];
  blocks.push({ kind: "heading", level: 2, content: "今日记录" });

  // 先加金额块（如果有）
  if (moneys.length > 0) {
    moneys.forEach((m) => {
      blocks.push({
        kind: "finance_item",
        direction: "expense",
        category: "other",
        value: m.value,
        content: m.content,
      });
    });
    blocks.push({ kind: "divider", content: "" });
  }

  // 加待办（如果有）
  if (todos.length > 0) {
    todos.forEach((t) => {
      blocks.push({ kind: "checkbox", content: t, checked: false });
    });
    blocks.push({ kind: "divider", content: "" });
  }

  // 正文（去掉已提取的金额和待办部分，精简一下）
  let body = text
    .replace(moneyRe, "")
    .replace(/(?:要|打算|明天|后天|周末|下周|得)\s*[^，。！？,.;；\n]{2,15}/g, "")
    .replace(/[，。！？,.]\s*[，。！？,.]+/g, "。")
    .replace(/^[，。！？,.\s]+|[，。！？,.\s]+$/g, "")
    .trim();
  if (body) blocks.push({ kind: "text", content: body });
  else if (text) blocks.push({ kind: "text", content: text });
  else blocks.push({ kind: "text", content: "今天的 " + tplName });

    // 🔑 情绪检测 → 调统一的 detectMoodByKeywords（已抽到函数外）
  const detectedMood = detectMoodByKeywords(text);

  // 🔑 默认 tags（基于模板）
  const defaultTags: Record<string, string[]> = {
    travel: ["旅行"], finance: ["记账"], reading: ["阅读"], plan: ["计划"],
    health: ["健康"], gratitude: ["感恩"], sports: ["运动"], diary: ["日记"],
  };
  const tags = defaultTags[ctx.templateId] ?? ["日记"];

  return { title, blocks, mood: detectedMood, tags };
}

/** Skill 2: 生成写作提示（空白恐惧时） */
export async function suggestPrompts(
  templateId: string,
  provider?: AiProvider | null
): Promise<string[]> {
  const p = provider ?? getAiProvider();
  if (!p) return FALLBACK_PROMPTS[templateId] ?? FALLBACK_PROMPTS.default;

  const raw = await callChatCompletion(p, [
    {
      role: "system",
      content: "你是日记写作助手。给用户 3-5 条温暖的写作提示。返回 JSON: {\"prompts\": [\"...\", \"...\"]}",
    },
    {
      role: "user",
      content: `当前模板: ${TEMPLATE_NAMES[templateId] ?? templateId}\n给 3-5 条引导式、有画面感的提示。`,
    },
  ]);

  try {
    const json = JSON.parse(extractJson(raw));
    return (json.prompts as string[]).slice(0, 5);
  } catch {
    return FALLBACK_PROMPTS[templateId] ?? FALLBACK_PROMPTS.default;
  }
}

/** Skill 3: 总结 + 标签 */
export async function summarize(
  fullText: string,
  provider?: AiProvider | null
): Promise<{ summary: string; tags: string[] }> {
  const p = provider ?? getAiProvider();
  if (!p) return { summary: fullText.slice(0, 100), tags: [] };

  const raw = await callChatCompletion(p, [
    {
      role: "system",
      content: "你是日记编辑。给这段日记写一句话摘要 + 3 个标签。返回 JSON: {\"summary\": \"...\", \"tags\": [\"...\"]}",
    },
    { role: "user", content: fullText },
  ]);

  try {
    const json = JSON.parse(extractJson(raw));
    return { summary: json.summary ?? "", tags: json.tags ?? [] };
  } catch {
    return { summary: fullText.slice(0, 100), tags: [] };
  }
}

// ============================================================
// Prompt 模板
// ============================================================

const TEMPLATE_NAMES: Record<string, string> = {
  diary: "日记",
  finance: "记账",
  reading: "读书",
  travel: "旅行",
  sports: "运动",
  plan: "每日计划",
  gratitude: "感恩日记",
  health: "健康记录",
};

const POLISH_SYSTEM_PROMPTS: Record<string, string> = {
  default: `你是温柔的日记写作助手。把用户的语音转写整理成结构化日记。

返回 JSON 格式:
{
  "title": "一句话总结当天（带 emoji）",
  "blocks": [...],
  "mood": "calm|happy|sad|anxious|angry",
  "tags": ["标签"]
}

title 规则:
- 必须根据用户实际说话内容总结，不能照搬模板默认标题！
- 不超过 15 字，开头加贴切的 emoji
- 比如用户说"今天故宫门票花 60 块，明天跑步" → "🏯 故宫漫步 + 60 元门票"
- 比如用户说"今天心情不错，读了三体" → "📚 三体读到忘我"

所有模板通用可用 block kind:
- heading / text / checkbox / number / divider / finance_item
根据用户提到的内容自由组合，不要只用某一种。`,

  finance: `你是记账助手。用户说的每一笔收入/支出 → finance_item。

返回 JSON:
{
  "title": "根据用户实际内容总结的一句话标题（带 💰）",
  "blocks": [...],
  "tags": ["记账"]
}

title 规则: 💰 开头 + 从用户说话里提炼！比如"💰 奶茶 15 元 + 故宫门票 60 元"
不要写"今日记账"这种模板默认标题！

blocks 规则:
- 每笔收支 → finance_item {"kind":"finance_item","direction":"expense/income","category":"food/transport/shopping/entertainment/health/education/salary/bonus/other","value":数字,"content":"备注"}
- 用户提到了计划/待办 → 也可以用 checkbox
- 用户提到了感受 → 也可以用 text
- heading/divider 用来组织结构，自由混合所有 kind`,

  travel: `你是旅行日记作家。

返回 JSON:
{
  "title": "✈️ + 从用户实际内容提炼的一句话亮点",
  "blocks": [...],
  "tags": ["旅行"]
}

title 必须根据用户实际内容，比如 "✈️ 故宫红墙下的阳光"。

blocks 按用户实际内容自由混合 heading/text/checkbox/number/finance_item/divider。
用户提到消费也可以用 finance_item。`,

  reading: `你是读书笔记助手。

返回 JSON:
{
  "title": "📚 书名 + 一句话感悟",
  "blocks": [...],
  "tags": ["读书"]
}

blocks 用 heading/text/checkbox 自由组织。`,

  gratitude: `你是感恩引导助手。

返回 JSON:
{
  "title": "💗 从用户实际内容提炼的感恩标题",
  "blocks": [...],
  "tags": ["感恩"]
}`,

  health: `你是健康记录助手。

返回 JSON:
{
  "title": "💪 从用户实际内容提炼",
  "blocks": [...],
  "tags": ["健康"]
}`,

  plan: `你是计划整理助手。

返回 JSON:
{
  "title": "🎯 从用户实际内容提炼",
  "blocks": [...],
  "tags": ["计划"]
}`,
};

const FALLBACK_PROMPTS: Record<string, string[]> = {
  default: [
    "今天让你微笑的一件小事是什么？",
    "如果用一个词形容今天，你会选什么？",
    "此刻你最想感谢谁？",
    "今天有什么意外的惊喜？",
  ],
  travel: [
    "今天的目的地给你留下最深印象的是什么？",
    "当地美食里哪道菜让你想再吃一次？",
    "旅途中遇到的最有趣的人是谁？",
    "今天走过了多少步？看了多少风景？",
  ],
  reading: [
    "书中哪句话让你停下来想了很久？",
    "这个主角的哪个选择你最有共鸣？",
    "读完这本书，你对什么有了新的看法？",
  ],
  gratitude: [
    "今天让你心里一暖的瞬间是什么？",
    "谁在默默支持你，而你很少说谢谢？",
    "今天的天气/食物/阳光里有什么值得感恩的？",
  ],
  plan: [
    "今天必须完成的一件事是什么？",
    "如果只能做一件事，你会选什么？",
    "今天想把时间花在哪个重要但不紧急的事上？",
  ],
};

// ============================================================
// 工具函数
// ============================================================

function extractJson(text: string): string {
  // 有时候 AI 会在 JSON 外面包 ```json ... ``` 或加解释文字
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // 找第一个 { 和最后一个 } 之间的内容
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);

  return text.trim();
}

// ============================================================
// Skill: 语音意图识别 → 自动匹配模板
// ============================================================

const ALL_TEMPLATES: { id: string; name: string; keywords: string[] }[] = [
  { id: "diary", name: "日记", keywords: ["今天", "发生", "心情", "感受", "日记", "日常", "琐事", "总结", "回顾", "一天", "早上", "下午", "晚上"] },
  { id: "finance", name: "记账", keywords: ["花了", "多少钱", "买了", "工资", "收入", "支出", "账单", "消费", "午饭钱", "打车费", "记账", "记一笔", "奶茶", "打车", "地铁", "公交", "房租", "水电", "话费", "网购", "报销", "还钱", "借钱", "掏", "付", "元", "块", "人民币", "外卖", "餐费", "咖啡"] },
  { id: "travel", name: "旅行", keywords: ["去哪", "旅游", "旅行", "景点", "门票", "坐车", "酒店", "赶路", "出发", "到达", "飞机", "火车", "高铁", "机票", "民宿", "攻略", "拍照", "打卡", "返程", "游玩"] },
  { id: "reading", name: "读书", keywords: ["读了", "这本书", "作者", "章节", "摘抄", "读后感", "推荐", "看书", "阅读", "学到", "书摘", "名著", "小说"] },
  { id: "sports", name: "运动", keywords: ["跑", "公里", "运动", "健身", "打球", "游泳", "步数", "锻炼", "拉伸", "瑜伽", "骑行", "网球", "足球", "篮球", "健身房", "减肥"] },
  { id: "plan", name: "计划", keywords: ["今天要做", "todo", "计划", "任务", "清单", "必须", "目标", "安排", "日程", "提醒", "待办", "这周", "明天", "准备"] },
  { id: "gratitude", name: "感恩", keywords: ["感恩", "感谢", "谢谢", "让我感动", "温暖", "幸福", "感激", "幸运", "好人", "帮我"] },
  { id: "health", name: "健康", keywords: ["睡了", "体重", "生病", "不舒服", "头疼", "吃药", "发烧", "健康", "失眠", "熬夜", "咳嗽", "拉肚子", "体检", "看病", "医院"] },
];

export interface DetectResult {
  templateId: string;
  confidence: number;
  reason: string;
}

function quickRuleMatch(text: string): DetectResult | null {
  const lower = text.toLowerCase();
  let bestId = "diary";
  let bestScore = 0;
  let bestReason = "";
  let bestIsDiary = false;

  for (const t of ALL_TEMPLATES) {
    let score = 0;
    for (const kw of t.keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score === 0) continue;

    // 新候选 vs 当前最佳：
    // - 分数更高 → 赢
    // - 同分且当前是 diary → 非 diary 赢（diary 是真正的 fallback）
    if (score > bestScore || (score === bestScore && bestIsDiary && t.id !== "diary")) {
      bestScore = score;
      bestId = t.id;
      bestReason = t.keywords.filter(k => lower.includes(k.toLowerCase())).join("、");
      bestIsDiary = t.id === "diary";
    }
  }

  if (bestScore >= 1) {
    return {
      templateId: bestId,
      confidence: Math.min(0.95, 0.4 + bestScore * 0.15),
      reason: bestReason ? `匹配关键词: ${bestReason}` : "通用日记",
    };
  }
  return null;
}

export async function detectTemplate(
  rawText: string,
  provider?: AiProvider | null,
  userTemplates?: { id: string; name: string; keywords?: string; description?: string }[]
): Promise<DetectResult> {
  const ruleResult = quickRuleMatch(rawText);
  // ⭐ 规则匹配只匹配 8 个官方模板（用户模板没有标准 keywords 数组，规则匹配不准）
  // 但如果规则匹配到了 diary（默认），我们再让 AI 同时看用户模板
  if (ruleResult && ruleResult.templateId !== "diary") {
    console.info("[ai] 🎯 官方模板规则匹配:", ruleResult.templateId, ruleResult.reason);
    return ruleResult;
  }

  const p = provider ?? getAiProvider();
  if (!p) {
    // 没有 AI 就只靠规则匹配
    if (ruleResult) return ruleResult;
    return { templateId: "diary", confidence: 0.3, reason: "未配置 AI，默认日记" };
  }

  // ⭐ 拼模板列表：官方 8 个 + 用户自建模板
  const systemTplList = ALL_TEMPLATES.map(t => `- "${t.id}" (${t.name}): ${t.keywords.slice(0, 3).join("/")}`).join("\n");

  let userTplList = "";
  if (userTemplates?.length) {
    userTplList = "\n你的模板:\n" + userTemplates
      .map(t => `- "${t.id}" (${t.name}): ${(t.keywords || t.description || "").slice(0, 60)}`)
      .join("\n");
  }

  const allValidIds = ALL_TEMPLATES.map(t => t.id).concat(userTemplates?.map(t => t.id) || []);

  const raw = await callChatCompletion(p, [
    { role: "system", content: `你是一个日记模板分类器。根据用户说的话，判断最适合的日记模板。
可选模板:
═ 系统模板 ═
${systemTplList}
${userTplList}

严格返回 JSON: {"templateId": "xxx", "confidence": 0.0-1.0, "reason": "一句话解释"}

用户模板的 id 是类似 "tpl_abc123" 的字符串。如果没有合适的就返回 "diary"。` },
    { role: "user", content: rawText },
  ], 0.3);

  try {
    const json = extractJson(raw);
    const r = JSON.parse(json) as DetectResult;
    if (!allValidIds.includes(r.templateId)) {
      return { templateId: "diary", confidence: 0.3, reason: "AI 返回无效模板，默认日记" };
    }
    const who = userTemplates?.some(t => t.id === r.templateId) ? "用户模板" : "系统模板";
    console.info(`[ai] 🎯 AI 匹配(${who}):`, r.templateId, r.reason);
    return { templateId: r.templateId, confidence: r.confidence ?? 0.7, reason: r.reason ?? "" };
  } catch (e) {
    console.warn("[ai] detectTemplate 解析失败，默认 diary:", e);
    return { templateId: "diary", confidence: 0.3, reason: "AI 解析失败，默认日记" };
  }
}

import type { Diary } from "./types";

// 模板默认标题（这些要过滤掉，不用它们）
const DEFAULT_TITLES = ["今日日记","旅行日记","今日记账","运动日记","读书笔记","感恩日记","健康日记","计划日记","今日记录"];

export async function summarizeDay(dayDiaries: Diary[], date: string): Promise<string | null> {
  if (!dayDiaries?.length) return null;

  const cacheKey = 'mydiary.summary.' + date;
  const cached = localStorage.getItem(cacheKey);
  // 过滤所有可能有问题的缓存：错误、模板标题复述、太短
  const badPatterns = ['reason', 'error', '旅行日记', '今日记账', '今日日记', '运动日记', '读书笔记', '感恩日记', '健康日记', '计划日记'];
  const isBadCache = cached && (badPatterns.some(p => cached.includes(p)) || cached.length < 8);
  if (cached && !isBadCache) return cached;
  if (cached) localStorage.removeItem(cacheKey);

  // 🔑 优先用 title（AI 快记时 title 是真实内容），过滤掉模板默认标题
  // 🔑 模板占位文字黑名单（checklist 模板默认内容）
  const PLACEHOLDER_PATTERNS = [
    /^早上做了什么/,
    /^下午逛了哪里/,
    /^晚上有什么安排/,
    /^今天吃了什么/,
    /^今天花了/,
    /^有没有遇到/,
    /^跑步 \/ 瑜伽/,
    /^头痛 \/ 疲惫/,
    /^我在做什么/,
    /^感受如何/,
    /^（可选）/,
  ];

  const parts = dayDiaries.map(d => {
    const title = (d.title || '').trim();
    // 跳过模板默认标题（带 emoji 前缀的默认模板标题）
    const startsWithEmoji = (() => { try { return /^[\u{1F300}-\u{1FAFF}]/u.test(title); } catch { return false; } })();
    const isDefaultTitle = DEFAULT_TITLES.some(t => title.includes(t)) || (title.length < 12 && startsWithEmoji);

    let body = '';
    if (Array.isArray(d.blocks)) {
      for (const b of d.blocks) {
        // 跳过不适合做文本摘要的 block 类型
        if (b.kind === 'heading' || b.kind === 'image' || b.kind === 'audio' || b.kind === 'divider') continue;
        // 跳过纯模板式 text 内容（太短的、像占位符的、模板 checklist 里的默认文字）
        if (b.content && b.content.length >= 4) {
          let text = b.content.trim();
          // 🔑 关键：过滤 data URL（图片 base64）
          if (text.startsWith('data:') || text.startsWith('base64,')) continue;
          // 过滤纯数字（记账模板里的金额数字独立 block）
          if (/^\d+(\.\d+)?$/.test(text)) continue;
          const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => p.test(text));
          if (isPlaceholder) continue;
          body += text + ' ';
          if (body.length > 150) break;
        }
      }
    }
    // 组合：用有效 title + body
    const pieces = [];
    if (title && !isDefaultTitle) pieces.push(title);
    if (body.trim()) pieces.push(body.trim());
    return pieces.join(' ');
  }).filter(t => t && t.length > 4).slice(0, 3);

  if (!parts.length) return null;

  const p = getAiProvider();
  if (!p) {
    const fb = ruleSummarize(parts);
    if (fb) { localStorage.setItem(cacheKey, fb); return fb; }
    return null;
  }

  try {
    const raw = await callChatCompletion(p, [
      { role: 'system', content: '你是诗意的日记摘要助手。根据一天的日记内容，写一句精美的总结。要求：一句话，20-28字，有画面感，用点文艺的词，提炼感受不要罗列事件，开头可以用emoji，不要加引号不要解释绝对不要返回JSON。示例：☀️ 羽毛球拍挥舞的下午，汗水和快乐一起落地；🌙 一碗梅菜扣肉的暖，足以撑起平凡的傍晚；🌸 故宫红墙下的脚步，踏过六百年的春风。不要写成原始正文复述，不要只是"旅行日记"这种空标题。' },
      { role: 'user', content: parts.join('\n') },
    ], 0.7);
    let clean = raw.trim();
    // 去掉前后引号和常见包裹符号
    clean = clean.replace(/^[\s"'\x60]*/, '').replace(/[\s"'\x60]*$/, '');
    // 如果是 JSON 错误，走规则降级
    if (clean.startsWith('{') || clean.includes('"reason"') || clean.includes('"error"')) {
      throw new Error('AI returned error JSON');
    }
    clean = clean.slice(0, 60);
    if (clean && clean.length >= 6) {
      localStorage.setItem(cacheKey, clean);
      return clean;
    }
    throw new Error('AI returned too short');
  } catch (e) {
    console.warn('[ai] summarizeDay failed:', e);
  }

  const fb = ruleSummarize(parts);
  if (fb) { localStorage.setItem(cacheKey, fb); return fb; }
  return null;
}

// ============================================================
// Skill: 读书推荐 — 基于用户日记内容推荐书目
// ============================================================

export interface BookRecommendation {
  title: string;
  author?: string;
  reason?: string;
  /** 书中金句 */
  openingQuote?: string;
  /** 金句出处（章节/页码） */
  quoteSource?: string;
  /** 一句话解读/看点 */
  quickTake?: string;
}

/**
 * 根据用户最近的日记内容，推荐 3-5 本书。
 * - 优先从日记里的兴趣关键词（旅行/历史/科幻/心理...）推断偏好
 * - 排除已在读书目，避免重复推荐
 * - 没有 AI 或 AI 失败 → 返回 FALLBACK_BOOKS
 */
export async function recommendBooks(
  contextDiaries: Diary[],
  existingBooks: string[],
  provider?: AiProvider | null
): Promise<BookRecommendation[]> {
  const p = provider ?? getAiProvider();

  // 构造用户兴趣画像：从最近 10 篇日记里抽取有实质内容的片段
  const recent = contextDiaries
    .filter(d => !d.deletedAt)
    .slice(0, 10);

  const snippets: string[] = [];
  for (const d of recent) {
    if (d.title && d.title.length > 3) snippets.push(d.title);
    if (Array.isArray(d.blocks)) {
      for (const b of d.blocks) {
        if (b.kind === "text" && b.content && b.content.length > 10 && !b.content.startsWith("data:")) {
          snippets.push(b.content.slice(0, 60));
        }
      }
    }
    if (snippets.length >= 15) break;
  }

  const existingList = existingBooks.filter(Boolean).slice(0, 20);

  if (!p) return filterFallback(existingList);

  const userContent = snippets.length
    ? snippets.join("\n")
    : "(暂无历史日记，推荐经典好书)";

  try {
    const raw = await callChatCompletion(p, [
      {
        role: "system",
        content: `你是有品味的阅读顾问。根据用户的日记内容，推荐 3-5 本适合 TA 的书，并为每本书准备好启动读书笔记的素材。

严格返回 JSON:
{"books": [{"title": "书名", "author": "作者", "reason": "一句话推荐理由", "openingQuote": "书中一句让人印象深刻的原文金句（完整句子，不要编造）", "quoteSource": "这句话的出处，如 第3章 或 上册P128", "quickTake": "一句话解读，帮读者快速抓住这本书的核心看点或气质"}]}

要求:
- 中文书名和金句，作者可选
- reason 要对应用户的具体兴趣，不要空话套话
- openingQuote 必须是书中真实存在的原文，不要编造！如果不确定就留空字符串
- quickTake 要精炼，20-40 字
- 排除用户已经在读的书（会在 user prompt 里列出）
- 书的类型要多样一点，不要全是同一个类别`,
      },
      {
        role: "user",
        content: `用户最近日记片段:
${userContent}

已经在读的书（不要重复推荐）:
${existingList.length ? existingList.join("、") : "(无)"}

请推荐 3-5 本书，返回严格 JSON。`,
      },
    ], 0.8);

    const json = extractJson(raw);
    const r = JSON.parse(json) as { books: BookRecommendation[] };
    if (Array.isArray(r.books) && r.books.length > 0) {
      return r.books
        .filter(b => b.title && !existingList.some(e => b.title!.includes(e) || e.includes(b.title!)))
        .slice(0, 5)
        .map(b => ({
          title: b.title.trim(),
          author: b.author?.trim() || undefined,
          reason: b.reason?.trim() || undefined,
          openingQuote: b.openingQuote?.trim() || undefined,
          quoteSource: b.quoteSource?.trim() || undefined,
          quickTake: b.quickTake?.trim() || undefined,
        }));
    }
  } catch (e) {
    console.warn("[recommendBooks] AI failed:", e);
  }

  return filterFallback(existingList);
}

/** AI 不可用时的安全网 — 10 本经典好书，每本配金句 + 解读 */
const FALLBACK_BOOKS: BookRecommendation[] = [
  { title: "活着", author: "余华", reason: "关于生命韧性的朴素叙事",
    openingQuote: "人是为活着本身而活着的，而不是为了活着之外的任何事物所活着。",
    quoteSource: "第1章", quickTake: "用一个农民的一生，写尽了中国人对苦难最朴素的承受。" },
  { title: "百年孤独", author: "马尔克斯", reason: "魔幻现实主义的巅峰之作",
    openingQuote: "多年以后，面对行刑队，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个遥远的下午。",
    quoteSource: "第1章", quickTake: "一句话把时间的重量和命运的循环砸在你脸上。" },
  { title: "人类简史", author: "尤瓦尔·赫拉利", reason: "换一个角度看我们自己",
    openingQuote: "金钱是有史以来最普遍也最有效的互信系统。",
    quoteSource: "第3章", quickTake: "把你一直以为的『常识』全部拆掉再重组。" },
  { title: "围城", author: "钱钟书", reason: "中国式幽默与世态炎凉",
    openingQuote: "城外的人想进去，城里的人想出来。",
    quoteSource: "第9章", quickTake: "一个比喻能当一本书的名片，这就是钱钟。" },
  { title: "小王子", author: "圣埃克苏佩里", reason: "写给大人的童话",
    openingQuote: "所有的大人都曾经是小孩，虽然，只有少数的人记得。",
    quoteSource: "献词", quickTake: "用最简单的方式说最扎心的话。" },
  { title: "平凡的世界", author: "路遥", reason: "普通人的奋斗史诗",
    openingQuote: "其实我们每个人的生活都是一个世界，即使最平凡的人也要为他生活的那个世界而奋斗。",
    quoteSource: "第3部", quickTake: "没有金手指，只有汗水和尊严。" },
  { title: "三体", author: "刘慈欣", reason: "中国科幻的里程碑",
    openingQuote: "给岁月以文明，而不是给文明以岁月。",
    quoteSource: "第3部", quickTake: "科幻不只是想象未来，更是照向现在的一面镜子。" },
  { title: "月亮与六便士", author: "毛姆", reason: "理想与现实的永恒对照",
    openingQuote: "满地都是六便士，他却抬头看见了月亮。",
    quoteSource: "结尾", quickTake: "如果你也曾想过『要不就这样算了』，这本书值得一读。" },
  { title: "撒哈拉的故事", author: "三毛", reason: "自由自在的生活方式",
    openingQuote: "每想你一次，天上飘落一粒沙，从此形成了撒哈拉。",
    quoteSource: "《撒哈拉的故事》", quickTake: "有一种生活，叫做『三毛式的浪漫』。" },
  { title: "沉默的大多数", author: "王小波", reason: "有趣的灵魂从不妥协",
    openingQuote: "我这辈子做过最正确的事，就是一直在走自己的路。",
    quoteSource: "《沉默的大多数》", quickTake: "幽默、聪明、不装——王小波是中文里少见的清醒者。" },
];

function filterFallback(existing: string[]): BookRecommendation[] {
  return FALLBACK_BOOKS
    .filter(b => !existing.some(e => b.title.includes(e) || e.includes(b.title)))
    .slice(0, 5);
}

/**
 * 手动输入书名后，AI 帮起个头 —— 返回金句 + 一句话解读。
 * 失败时返回空对象（不阻塞编辑器）。
 */
export async function kickoffBookNote(
  title: string,
  author?: string,
  provider?: AiProvider | null
): Promise<{ openingQuote?: string; quoteSource?: string; quickTake?: string }> {
  const p = provider ?? getAiProvider();
  if (!p) return {};
  if (!title.trim()) return {};

  try {
    const raw = await callChatCompletion(p, [
      {
        role: "system",
        content: `你是读书笔记助手。用户正在读一本书，帮 TA 准备好启动笔记的素材。
严格返回 JSON: {"openingQuote": "书中真实存在的一句金句，不确定就留空字符串", "quoteSource": "出处如 第3章", "quickTake": "20-40字的一句话解读"}
openingQuote 必须是原文，绝对不要编造！如果不确定这本书的原文就返回空字符串。`,
      },
      {
        role: "user",
        content: `书名: 《${title}》${author ? ` 作者: ${author}` : ""}
请给出 1 句金句 + 1 个解读，返回严格 JSON。`,
      },
    ], 0.6);

    const json = extractJson(raw);
    const r = JSON.parse(json) as { openingQuote?: string; quoteSource?: string; quickTake?: string };
    return {
      openingQuote: r.openingQuote?.trim() || undefined,
      quoteSource: r.quoteSource?.trim() || undefined,
      quickTake: r.quickTake?.trim() || undefined,
    };
  } catch (e) {
    console.warn("[kickoffBookNote] failed:", e);
    return {};
  }
}

function ruleSummarize(parts: string[]): string | null {
  const text = parts.join(' ');
  const has = (kws: string[]) => kws.some(k => text.includes(k));
  const emoji = has(['跑', '运动', '健身', '打球']) ? '🏃'
    : has(['吃', '饭', '美食', '饼', '外卖']) ? '🍜'
    : has(['玩', '公园', '旅游', '故宫', '景点']) ? '🌸'
    : has(['书', '读', '看']) ? '📖'
    : has(['钱', '花', '记账', '买']) ? '💰'
    : has(['谢谢', '感恩', '感谢']) ? '💝'
    : has(['睡', '失眠']) ? '🌙'
    : has(['工作', '忙', '加班']) ? '💼'
    : '✨';
  // 取第一句，去空白，最多 28 字（AI 总结的标准长度）
  const firstSentence = text.split(/[。！？!?\n]/)[0].trim();
  if (!firstSentence || firstSentence.length < 2) return null;
  // 硬上限 30 字，不主动加省略号
  const body = firstSentence.length > 30 ? firstSentence.slice(0, 30) : firstSentence;
  return emoji + ' ' + body;
}

// ============================================================
// Skill: 反馈整理 — 把用户口语化反馈转成开发可处理的结构化格式
// ============================================================

export interface PolishFeedbackResult {
  title: string;           // 一句话标题（≤30字）
  steps: string[];          // 复现步骤（如果有）
  expected: string;         // 期望行为
  actual: string;           // 实际行为（如果是 bug）
  suggestion?: string;      // 改进建议（如果是建议类）
  severity: "low" | "medium" | "high";
}

/**
 * Skill 4: 反馈整理 — 用户口语化描述 → 开发视角的 bug report / suggestion
 * 和日记 polish 不同！不是润色成文章，而是**拆解成问题**
 */
export async function polishFeedback(
  rawText: string,
  feedbackType: string = "suggestion",
  provider?: AiProvider | null
): Promise<string> {
  if (!rawText?.trim()) return rawText;

  const p = provider ?? getAiProvider();
  if (!p) return rawText; // 没 AI 就返回原文

  const typeLabel: Record<string, string> = {
    suggestion: "💡 建议",
    bug: "🐛 Bug 报告",
    other: "📝 其他",
  };

  const systemPrompt = `你是一名资深 QA，负责把用户口语化的反馈/建议整理成开发团队能直接处理的结构化条目。

**核心原则**：不是把用户的话润色成文章，而是**拆解成清晰的条目**，让开发一眼能看懂。

**你要做的**：
1. 修正错别字（同音字/语音转写错误）
2. 识别用户说的是什么功能、什么场景
3. 提炼关键信息，去掉"气死我了""真糟糕"等情绪词
4. 整理成**纯文本条目**，不要任何 Markdown 代码块（不要用 \`\`\` 包裹）

**输出格式（纯文本，不要代码块）**：

如果是 Bug，输出这 4 行：
标题：一句话说清楚（≤30字）
复现：用户操作了什么步骤
期望：本来应该发生什么
实际：现在实际发生了什么

如果是建议，输出这 3 行：
标题：一句话说清楚（≤30字）
现状：现在是什么样
希望：希望改成什么样

**格式要求**：
- 纯文本，不要 \`\`\` markdown \`\`\` 代码块
- 不要 **粗体**，就用"标题：" 这样的中文标签
- 每条一行，简短精炼
- 语气客观，不带情绪`;

  const userPrompt = `用户原始反馈（${typeLabel[feedbackType] ?? feedbackType}）:
${rawText}

请整理成结构化的开发视角格式，返回 Markdown 文字。`;

  try {
    const raw = await callChatCompletion(p, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 0.3); // 低温度 = 客观事实，不要瞎发挥
    return raw.trim();
  } catch {
    return rawText; // AI 挂了 → 返回原文
  }
}
