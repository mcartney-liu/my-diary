// 快速测试 extractDateFromText
const fs = require('fs');
const src = fs.readFileSync('src/ai.ts', 'utf-8');

const fnMatch = src.match(/function extractDateFromText[\s\S]*?^}$/m);
if (!fnMatch) { console.log('❌ 函数没找到'); process.exit(1); }

let code = fnMatch[0];
code += `
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
`;

fs.writeFileSync('_test_extract.cjs', code);
require('child_process').execSync('node _test_extract.cjs', { stdio: 'inherit', cwd: __dirname });
fs.unlinkSync('_test_extract.cjs');
