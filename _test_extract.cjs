function extractDateFromText(text: string, today: Date): {
  start_date?: string; target_date?: string; target_mm?: number; target_dd?: number;
  isStart?: boolean; isFixed?: boolean; isCountdown?: boolean;
} {
  const result: any = {};
  const lower = text.toLowerCase();

  // 1. YYYY-MM-DD / YYYY年MM月DD日 → 提取完整日期
  const fullDate = text.match(/(\d{4})[年\-\/\.](\d{1,2})[月\-\/\.](\d{1,2})/);
  // 2. MM月DD日 / MM-DD / MM/DD → 只有月日（每年固定）
  const mmddDate = text.match(/(\d{1,2})[月\-\/](\d{1,2})日?/);
  // 3. 基数词日期：五月一日 / 五月十五
  const cnDate = text.match(/([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})日?/);
  const cnNum: Record<string, number> = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9, "十":10,"十一":11,"十二":12,"十三":13,"十四":14,"十五":15,"十六":16,"十七":17,"十八":18,"十九":19,"二十":20,"二十一":21,"二十二":22,"二十三":23,"二十四":24,"二十五":25,"二十六":26,"二十七":27,"二十八":28,"二十九":29,"三十":30,"三十一":31 };
  // 4. "X 天前" / "X 天了" / "X 天" 开头的 → 可以从今天反推 start_date
  const daysAgo = text.match(/(\d+)\s*天\s*(?:前|了|之前)/);
  const daysCountdown = text.match(/(?:还有|还有)\s*(\d+)\s*天/);
  // 5. "今天" "今天是" → target_date = 今天
  const isToday = /今天/.test(text);

  if (fullDate) {
    const y = parseInt(fullDate[1]);
    const m = parseInt(fullDate[2]);
    const d = parseInt(fullDate[3]);
    if (isToday) {
      // "今天是 XXXX 年 XX 月 XX 日" → 那就是今天
      result.target_date = today.toISOString().slice(0, 10);
      result.isCountdown = true;
    } else if (lower.includes("认识") || lower.includes("在一起") || lower.includes("交往") || lower.includes("开始") || lower.includes("养猫") || lower.includes("养") || lower.includes("成立")) {
      // 有具体年月日 + 有"从某天开始算"的语义 → start
      result.start_date = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      result.isStart = true;
    } else if (lower.includes("还有") || lower.includes("倒计时") || lower.includes("距离")) {
      result.target_date = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      result.isCountdown = true;
    } else {
      // 有具体年月日，但是"每年的这天" → fixed
      result.target_mm = m; result.target_dd = d;
      result.isFixed = true;
    }
  } else if (mmddDate && !fullDate) {
    // 只有月日 → 每年固定
    result.target_mm = parseInt(mmddDate[1]);
    result.target_dd = parseInt(mmddDate[2]);
    result.isFixed = true;
  } else if (cnDate) {
    // 中文月日
    result.target_mm = cnNum[cnDate[1]];
    result.target_dd = cnNum[cnDate[2]];
    if (result.target_mm && result.target_dd) {
      result.isFixed = true;
    }
  }

  // 补充：如果有 "X 天" + "今天" → start_date = 今天 - X 天
  if (daysAgo && !result.start_date) {
    const days = parseInt(daysAgo[1]);
    const past = new Date(today.getTime() - days * 86400000);
    result.start_date = past.toISOString().slice(0, 10);
    result.isStart = true;
  }
  // 补充：如果有 "还有 X 天" → target_date = 今天 + X 天
  if (daysCountdown && !result.target_date) {
    const days = parseInt(daysCountdown[1]);
    const future = new Date(today.getTime() + days * 86400000);
    result.target_date = future.toISOString().slice(0, 10);
    result.isCountdown = true;
  }

  return result;
}
const today = new Date(2026, 8, 17); // 2026-09-17
const tests = [
  '今天是 2026 年 12 月 15 日我媳妇的生日',
  '我们 2020 年 9 月 1 日认识的',
  '5月20日我们每年都过',
  '还有 100 天高考',
  '认识 500 天了',
  '2025-05-01 在一起',
  '2025/05/01 认识',
];
console.log('=== extractDateFromText tests ===');
tests.forEach(t => {
  const r = extractDateFromText(t, today);
  console.log(JSON.stringify(r).slice(0, 130), '<-', t);
});
