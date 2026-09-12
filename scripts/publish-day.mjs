// 指定日の posts/{日付}.json を gzip+base64 して POSTS_JSON Secret に反映。複数日渡せる。
// 実行: node scripts/publish-day.mjs 2026-01-20 [2026-01-21 ...]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = process.env.SCHED_REPO || 'marumo6627/threads-scheduler'; // ←自分のリポに変更
const dates = process.argv.slice(2).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
if (!dates.length) { console.error('使い方: node scripts/publish-day.mjs <YYYY-MM-DD> [...]'); process.exit(1); }
// ★今日の日付を渡し忘れると、当日の未投稿分が消える（鉄則4・2026-09-12 に再発）。
// posts/ に当日分のファイルがあるのに引数へ入っていなければ止める。
const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
if (!dates.includes(jstToday) && existsSync(join(ROOT, 'posts', `${jstToday}.json`))) {
  console.error(`::error::[publish-day] 当日(${jstToday})が引数に入っていません。`);
  console.error(`  POSTS_JSON は上書きなので、このまま実行すると当日の未投稿分が消えます。`);
  console.error(`  → node scripts/publish-day.mjs ${jstToday} ${dates.join(' ')}`);
  console.error(`  当日分が全て投稿済みで意図的に外す場合は --allow-drop-today を付けてください。`);
  if (!process.argv.includes('--allow-drop-today')) process.exit(1);
  console.error(`  --allow-drop-today のため続行します。`);
}

const byDate = {}; let total = 0;
for (const d of dates) {
  const arr = JSON.parse(readFileSync(join(ROOT, 'posts', `${d}.json`), 'utf8'));
  byDate[d] = arr; total += arr.length;
}
const payload = Buffer.from(gzipSync(Buffer.from(JSON.stringify(byDate), 'utf8'))).toString('base64');
const r = spawnSync('gh', ['secret', 'set', 'POSTS_JSON', '-R', REPO, '--body', payload], { stdio: 'inherit', shell: false });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`✅ POSTS_JSON 更新: ${dates.join(',')} / 計${total}本 / ${payload.length}bytes`);
