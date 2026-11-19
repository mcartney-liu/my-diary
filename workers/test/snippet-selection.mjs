// 片段选取逻辑的回归测试（不依赖 Cloudflare 运行时）
// 直接从 workers/src/index.js 抽取 pure function 源码执行，避免测试与实现各写一份。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(here, '..', 'src', 'index.js');
const src = fs.readFileSync(srcPath, 'utf8');

function extractFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`函数未找到: ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`函数括号不闭合: ${name}`);
}

const fnSrc = [extractFunction('keywordScore'), extractFunction('selectRelevantSnippet')].join('\n');
// eslint-disable-next-line no-new-func
const { keywordScore, selectRelevantSnippet } = new Function(
  `${fnSrc}\nreturn { keywordScore, selectRelevantSnippet };`
)();

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

console.log('1) 短内容原样返回（与旧行为一致）');
{
  const short = '水滴轮的选择要点：速比、线杯、轴承数量。';
  const out = selectRelevantSnippet(short, ['速比'], 800);
  check('内容 <= 预算时完全不变', out === short, `得到: ${JSON.stringify(out)}`);
}

console.log('2) 长页面：目标信息在第 3 节之后，旧实现会丢，新实现必须带上');
{
  const s1 = '## 概述\n' + '这是一篇关于路亚装备的总览。'.repeat(20);
  const s2 = '## 分类\n' + '装备分为竿、轮、线、饵四类。'.repeat(25);
  const s3 = '## 实战技巧\n' + '波爬钓法适合清晨，收线节奏要慢，停顿要明显。'.repeat(20);
  const s4 = '## 维护\n' + '每次用完要用清水冲洗线杯。'.repeat(20);
  const page = [s1, s2, s3, s4].join('\n');
  const out = selectRelevantSnippet(page, ['波爬', '收线'], 800);
  check('命中第 3 节的关键句', out.includes('波爬钓法适合清晨'), '');
  check('长度不超过预算', out.length <= 800, `实际 ${out.length}`);
  check('首节仍在（保底）', out.includes('总览'), '');
  check('未命中的冷门节未被塞满', !out.includes('清水冲洗线杯'), '');
}

console.log('3) 关键词全不命中时，退回"取开头"，不返回空');
{
  const page = ('## A\n' + '正文甲。'.repeat(100)) + '\n' + ('## B\n' + '正文乙。'.repeat(100));
  const out = selectRelevantSnippet(page, ['毫不相关的词'], 800);
  check('非空', out.length > 0, '');
  check('不超过预算', out.length <= 800, `实际 ${out.length}`);
  check('仍是页面前部内容', out.startsWith('## A'), out.slice(0, 20));
}

console.log('4) 无 Markdown 标题时按空行/换行切分也不崩');
{
  const page = Array.from({ length: 30 }, (_, i) => `第${i + 1}段：这里是一些内容，包含关键词${i === 20 ? '目标词' : '普通词'}。`).join('\n');
  const out = selectRelevantSnippet(page, ['目标词'], 400);
  check('命中目标段', out.includes('目标词'), '');
  check('不超过预算', out.length <= 400, `实际 ${out.length}`);
}

console.log('5) 空值/纯空白不抛异常');
{
  check('null → 空串', selectRelevantSnippet(null, ['a'], 800) === '');
  check('空白 → 空串', selectRelevantSnippet('   ', ['a'], 800) === '');
}

console.log('6) keywordScore 自身行为未被改动');
{
  check('空关键词为 0', keywordScore('abc', []) === 0);
  check('命中给正分', keywordScore('波爬钓法', ['波爬']) > 0);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
