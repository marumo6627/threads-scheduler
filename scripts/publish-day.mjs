// 指定日の posts/{日付}.json を gzip+base64 して POSTS_JSON Secret に反映。複数日渡せる。
// 実行: node scripts/publish-day.mjs 2026-01-20 [2026-01-21 ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = process.env.SCHED_REPO || 'marumo6627/threads-scheduler'; // ←自分のリポに変更
const dates = process.argv.slice(2).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
if (!dates.length) { console.error('使い方: node scripts/publish-day.mjs <YYYY-MM-DD> [...]'); process.exit(1); }
const byDate = {}; let total = 0;
for (const d of dates) {
  const arr = JSON.parse(readFileSync(join(ROOT, 'posts', `${d}.json`), 'utf8'));
  byDate[d] = arr; total += arr.length;
}
const payload = Buffer.from(gzipSync(Buffer.from(JSON.stringify(byDate), 'utf8'))).toString('base64');
const r = spawnSync('gh', ['secret', 'set', 'POSTS_JSON', '-R', REPO, '--body', payload], { stdio: 'inherit', shell: false });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`✅ POSTS_JSON 更新: ${dates.join(',')} / 計${total}本 / ${payload.length}bytes`);
