// 「今天」页的本地动态信息：节气、节日、倒计时、天气小贴士
// 不联网、不调 AI；节气用 21 世纪通用公式计算（个别年份可能差 1 天）

export interface DayEvent { date: string; name: string; icon: string; kind: "term" | "festival" }

const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// ---------- 二十四节气 ----------
// 日 = floor(Y×0.2422 + C) − floor(L/4)，Y 为年份后两位；1、2 月的节气 L 用 Y−1
const TERMS: [number, string, number, string][] = [
  // [月, 名称, C 值, 图标]
  [1, "小寒", 5.4055, "🥶"], [1, "大寒", 20.12, "❄️"],
  [2, "立春", 3.87, "🌱"], [2, "雨水", 18.73, "🌧️"],
  [3, "惊蛰", 5.63, "⚡"], [3, "春分", 20.646, "🌸"],
  [4, "清明", 4.81, "🌿"], [4, "谷雨", 20.1, "🌾"],
  [5, "立夏", 5.52, "☀️"], [5, "小满", 21.04, "🌾"],
  [6, "芒种", 5.678, "🌾"], [6, "夏至", 21.37, "🌞"],
  [7, "小暑", 7.108, "🌤️"], [7, "大暑", 22.83, "🔥"],
  [8, "立秋", 7.5, "🍂"], [8, "处暑", 23.13, "🍃"],
  [9, "白露", 7.646, "💧"], [9, "秋分", 23.042, "🍁"],
  [10, "寒露", 8.318, "🍂"], [10, "霜降", 23.438, "🌫️"],
  [11, "立冬", 7.438, "🧣"], [11, "小雪", 22.36, "🌨️"],
  [12, "大雪", 7.18, "❄️"], [12, "冬至", 21.94, "🥟"],
];
function termsOf(year: number): DayEvent[] {
  const y = year % 100;
  return TERMS.map(([m, name, c, icon]) => {
    const l = m <= 2 ? y - 1 : y;
    const d = Math.floor(y * 0.2422 + c) - Math.floor(l / 4);
    return { date: ymd(year, m, d), name, icon, kind: "term" as const };
  });
}

// ---------- 节日 ----------
// 农历节日只维护春节相关（每年手工核对后补充；没有的年份就不显示）
const SPRING_FESTIVAL: Record<number, string> = {
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
};
function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
// 某月第 n 个星期 w（0=周日）
function nthWeekday(year: number, month: number, w: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((w - first + 7) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}
function festivalsOf(year: number): DayEvent[] {
  const f = (date: string, name: string, icon: string): DayEvent => ({ date, name, icon, kind: "festival" });
  const list: DayEvent[] = [
    f(ymd(year, 1, 1), "元旦", "🎉"),
    f(ymd(year, 2, 14), "情人节", "💝"),
    f(ymd(year, 3, 8), "妇女节", "🌷"),
    f(ymd(year, 5, 1), "劳动节", "🛠️"),
    f(ymd(year, 6, 1), "儿童节", "🎈"),
    f(ymd(year, 9, 10), "教师节", "🍎"),
    f(ymd(year, 10, 1), "国庆节", "🇨🇳"),
    f(ymd(year, 12, 24), "平安夜", "🎄"),
    f(ymd(year, 12, 25), "圣诞节", "🎅"),
    f(ymd(year, 12, 31), "跨年夜", "🎆"),
    f(nthWeekday(year, 5, 0, 2), "母亲节", "💐"),
    f(nthWeekday(year, 6, 0, 3), "父亲节", "👔"),
    f(nthWeekday(year, 11, 4, 4), "感恩节", "🦃"),
  ];
  const sf = SPRING_FESTIVAL[year];
  if (sf) {
    list.push(f(addDays(sf, -1), "除夕", "🧧"), f(sf, "春节", "🏮"), f(addDays(sf, 14), "元宵节", "🏮"));
  }
  return list;
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** 今天的节气 / 节日，以及接下来 withinDays 天内的 */
export function dayEvents(today: string, withinDays = 7): { today: DayEvent[]; upcoming: (DayEvent & { days: number })[] } {
  const year = Number(today.slice(0, 4));
  const all = [...termsOf(year), ...termsOf(year + 1), ...festivalsOf(year), ...festivalsOf(year + 1)];
  const todayList = all.filter((e) => e.date === today);
  const upcoming = all
    .map((e) => ({ ...e, days: daysBetween(today, e.date) }))
    .filter((e) => e.days > 0 && e.days <= withinDays)
    .sort((a, b) => a.days - b.days);
  return { today: todayList, upcoming };
}

/** 离春节还有多少天（100 天以内才返回） */
export function springFestivalCountdown(today: string): number | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const sf = SPRING_FESTIVAL[y];
    if (!sf) continue;
    const d = daysBetween(today, sf);
    if (d > 0 && d <= 100) return d;
  }
  return null;
}

/** 根据天气给一句轻轻的提示（不调 AI） */
export function weatherTip(desc: string, temp: number): string {
  if (/雷/.test(desc)) return "有雷雨，尽量待在室内～";
  if (/雨/.test(desc)) return "下雨天，适合窝着写点东西 ☕";
  if (/雪/.test(desc)) return "下雪啦，记得拍张照片放进日记里";
  if (/雾|霾/.test(desc)) return "空气不太好，出门戴个口罩吧";
  if (temp <= 0) return "好冷，多穿点 🧣";
  if (temp <= 10) return "有点凉，注意保暖";
  if (temp >= 33) return "很热，多喝水 💧";
  if (/晴/.test(desc)) return "天气不错，出去走走吧 🌿";
  return "";
}
