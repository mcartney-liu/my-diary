#!/usr/bin/env node
// backfill-word-count.js
// 给已有日记回填 diaries.word_count 列（migration 0028 只加列不填数据）
//
// 用法：
//   # 先跑 migration（dev + prod 各一次）
//   npx wrangler d1 migrations apply mydiary-db-dev --remote
//   npx wrangler d1 migrations apply mydiary-db    --remote
//
//   # dry-run（只统计比对，不写库）
//   npx wrangler d1 execute mydiary-db-dev --remote --command="SELECT id, user_id, blocks FROM diaries" > blocks.ndjson
//   node backfill-word-count.js --dry-run --file blocks.ndjson
//
//   # 正式回填（先 migration，再回填）
//   node backfill-word-count.js --file blocks.ndjson --update
//   # 然后用 wrangler d1 execute 或 Worker 路由批量 UPDATE
//
// 为什么不是直接 wrangler d1 execute 就能做？
//   D1 不支持 sqlite-json1 的 json_extract 数组遍历，没法在 SQL 里算 word_count
//   所以必须拉 blocks 到本地，Node.js 解析 JSON 算完，批量 UPDATE 回去

import { readFileSync } from "node:fs";

// 与 index.js calcWordCount 完全一致
function calcWordCount(blocks) {
  if (!Array.isArray(blocks)) return 0;
  let n = 0;
  for (const b of blocks) {
    if (b && b.kind === "text") {
      const c = b.content;
      if (c != null) n += c.length;
    }
  }
  return n;
}

// 旧算法（handleGetProfile 扫全库用的那个）——严格一致，用于等价性校验
function oldWordCount(blocksJson) {
  try {
    const blocks = JSON.parse(blocksJson || "[]");
    let n = 0;
    for (const b of blocks) {
      if (b.kind === "text" && b.content) n += b.content.length;
    }
    return n;
  } catch {
    return 0;
  }
}

function parseNdjson(text) {
  // 兼容两种输入：wrangler d1 execute --json（数组）vs --command 每行一条 NDJSON
  // wrangler d1 execute 输出是 JSON array，但如果用 --file .sql 多条命令输出混合
  // 我们假设用户用 --json 导出单条 SELECT 的结果
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
  } catch {}
  // fallback: NDJSON
  return text.split("\n").filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const doUpdate = args.has("--update");
  const fileIdx = [...process.argv].indexOf("--file");
  const filePath = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;

  if (!filePath) {
    console.error("用法: node backfill-word-count.js --file <blocks.ndjson> [--dry-run] [--update]");
    console.error("  blocks.ndjson 来源: wrangler d1 execute mydiary-db --remote --json --command=\"SELECT id, user_id, blocks FROM diaries\"");
    process.exit(1);
  }

  const rows = parseNdjson(readFileSync(filePath, "utf-8"));
  console.log(`📖 读取 ${rows.length} 条日记`);

  // 1. 逐篇比对：calcWordCount vs oldWordCount —— 必须 100% 相等
  let equal = 0, diff = 0;
  const updates = []; // [id, wordCount]
  const mismatches = [];

  for (const r of rows) {
    const id = r.id;
    const blocks = (() => { try { return JSON.parse(r.blocks || "[]"); } catch { return []; } })();
    const newVal = calcWordCount(blocks);
    const oldVal = oldWordCount(r.blocks);
    if (newVal === oldVal) {
      equal++;
    } else {
      diff++;
      mismatches.push({ id, newVal, oldVal });
    }
    updates.push([id, newVal]);
  }

  console.log(`\n✅ 等价性校验：逐篇比对 calcWordCount vs 旧算法`);
  console.log(`   相等：${equal} / ${rows.length}`);
  console.log(`   不等：${diff} / ${rows.length}`);
  if (diff > 0) {
    console.log(`   ⚠️ 前 5 条不等：`);
    mismatches.slice(0, 5).forEach(m => console.log(`      id=${m.id} new=${m.newVal} old=${m.oldVal}`));
    console.error(`\n❌ 存在不等，停止回填。请先排查原因。`);
    process.exit(1);
  }
  console.log(`   🎉 100% 相等，可以安全回填`);

  // 2. 统计每个用户的 total_words（用于批量 UPDATE profiles）
  const userTotals = new Map();
  for (const r of rows) {
    const uid = r.user_id;
    const wc = updates.find(u => u[0] === r.id)[1];
    userTotals.set(uid, (userTotals.get(uid) || 0) + wc);
  }

  console.log(`\n📊 用户总数：${userTotals.size}`);

  if (dryRun) {
    console.log(`\n🧪 --dry-run 模式，不写库。要真正回填请加 --update`);
    console.log(`   要生成 UPDATE SQL：追加 --sql-out 重跑，或用下面命令手工执行。`);
    return;
  }

  if (doUpdate) {
    // 输出可以直接喂给 wrangler d1 execute 的 SQL（batch 50 条）
    // wrangler d1 execute 不支持一次传太多参数，所以生成 SQL 文件分批改
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      batches.push(updates.slice(i, i + BATCH_SIZE));
    }
    console.log(`\n📝 生成 ${batches.length} 个 batch SQL（每 batch ${BATCH_SIZE} 条）`);
    console.log(`   执行方式：`);
    console.log(`     for f in batch_*.sql; do wrangler d1 execute mydiary-db --remote --file "$f"; done`);

    // 写 SQL 文件到当前目录
    const fs = require("fs");
    const path = require("path");
    batches.forEach((batch, i) => {
      const sql = batch.map(([id, wc]) =>
        `UPDATE diaries SET word_count = ${wc} WHERE id = '${id}';`
      ).join("\n");
      fs.writeFileSync(`batch_${String(i).padStart(3, "0")}.sql`, sql);
    });

    // profiles.total_words 同步
    const profSql = [...userTotals.entries()].map(([uid, total]) =>
      `UPDATE profiles SET total_words = ${total} WHERE user_id = '${uid}';`
    ).join("\n");
    fs.writeFileSync("batch_profiles.sql", profSql);
    console.log(`   另外生成 batch_profiles.sql（${userTotals.size} 个用户的 profiles.total_words 同步）`);
  }
}

main();
