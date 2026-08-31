// assets/ の画像を公開リポに push し、Threads から参照できる raw URL を検証して出す。
// Drive も rclone も不要。実行: node scripts/publish-images.mjs [--check-only]
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = process.env.SCHED_REPO || 'marumo6627/threads-scheduler';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/`;
const CHECK_ONLY = process.argv.includes('--check-only');
const OK_EXT = /\.(jpe?g|png)$/i;
const MAX_BYTES = 8 * 1024 * 1024;   // Threads の画像上限

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (OK_EXT.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'assets')).map(f => relative(ROOT, f).split('\\').join('/'));
if (!files.length) { console.log('assets/ に jpg/png がありません'); process.exit(0); }

console.log(`assets/ の画像 ${files.length} 件`);
let tooBig = 0;
for (const f of files) {
  const kb = Math.round(statSync(join(ROOT, f)).size / 1024);
  const over = statSync(join(ROOT, f)).size > MAX_BYTES;
  if (over) tooBig++;
  console.log(`  ${over ? '❌' : '  '} ${f}  ${kb}KB${over ? '  ← 8MB超。Threadsが受け付けません' : ''}`);
}
if (tooBig) { console.error(`\n${tooBig}件が上限超過。縮小してから再実行してください`); process.exit(1); }

if (!CHECK_ONLY) {
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  git('add', 'assets');
  const st = git('status', '--porcelain', 'assets').stdout.trim();
  if (st) {
    const c = git('-c', 'user.email=takizawa.mut@gmail.com', '-c', 'user.name=marumo6627',
                  'commit', '-m', `assets: 投稿画像を更新 (${files.length}件)`);
    if (c.status !== 0) { console.error(c.stderr); process.exit(1); }
    const pu = git('push', 'origin', 'main');
    if (pu.status !== 0) { console.error(pu.stderr); process.exit(1); }
    console.log('\n✅ push 完了');
  } else {
    console.log('\n変更なし（push 不要）');
  }
}

console.log('\n=== raw URL の到達確認 ===');
let ng = 0;
for (const f of files) {
  const url = RAW_BASE + f;
  const r = await fetch(url, { method: 'HEAD' });
  const ct = r.headers.get('content-type') || '';
  const ok = r.ok && /^image\//.test(ct);
  if (!ok) ng++;
  console.log(`  ${ok ? '✅' : '❌'} ${f}  HTTP ${r.status}  ${ct}`);
  if (ok) console.log(`     ${url}`);
}
console.log(ng ? `\n⚠️ ${ng}件が到達不可。push 直後は反映に数十秒かかることがあります`
              : `\nすべて到達確認済み。posts.json の "image" に相対パス（例: "assets/xxx.jpg"）を入れてください`);
