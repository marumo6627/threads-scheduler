// 予定投稿が過去の実投稿・直近の予定と重複していないかを見る。
// 2026-09-26: 1行目と先頭24字しか見ておらず、rui で「1行目だけ変えて本文が同じ」投稿が
// 5日連続で出ていた。順位行を除いた本文でも照合する。
// 実行: node scripts/check-dup.mjs <YYYY-MM-DD> [比較する予定日...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'https://graph.threads.net/v1.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const date = process.argv[2];
const others = process.argv.slice(3);
if (!date) { console.error('使い方: node scripts/check-dup.mjs <YYYY-MM-DD> [比較日...]'); process.exit(1); }

const norm = s => s.replace(/[「」『』。、！？　\s]/g, '');
// 順位行(1位 ◯◯座 / 第1位 ◯◯座)と分岐行を除いた「地の文」
const body = t => t.split('\n')
  // ★2026-10-10: 分岐行(『…』)の除外をやめた。moon の時刻分岐は10行中7行が
  // 毎日完全に同じで、それを検査対象から外していたため気づけなかった。
  // 順位行だけは星座名が入るので除外を続ける（assign-signs が別に散らす）。
  .filter(l => l.trim() && !/^第?[0-9]位[　\s]/.test(l))
  .slice(1)                      // 1行目(フック)も除く
  .map(l => norm(l)).join('|');

const toks = JSON.parse(readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const plan = JSON.parse(readFileSync(join(ROOT, 'posts', `${date}.json`), 'utf8'));
const prev = [];
for (const d of others) {
  try { prev.push(...JSON.parse(readFileSync(join(ROOT, 'posts', `${d}.json`), 'utf8'))); } catch {}
}

let ng = 0;
for (const t of toks) {
  const tok = encodeURIComponent(t.access_token);
  let url = `${A}/me/threads?fields=id,text,timestamp,is_reply&limit=100&access_token=${tok}`;
  const past = [];
  for (let pg = 0; url && pg < 3; pg++) {
    const r = await fetch(url).then(x => x.json()).catch(() => ({}));
    if (r.error || !r.data) break;
    // 当日分は自分自身なので除外（すでに投稿済みの当日分と照合してしまうため）
    past.push(...r.data.filter(x => !x.is_reply &&
      new Date(Date.parse(x.timestamp) + 9 * 3600 * 1000).toISOString().slice(0, 10) !== date));
    url = r.paging?.next || null;
    await sleep(110);
  }
  const pool = [...past.map(x => x.text || ''), ...prev.filter(x => x.account === t.account).map(x => x.text)];
  const H = pool.map(x => norm(x.split('\n')[0]));
  const B = pool.map(x => body(x)).filter(Boolean);
  const S = pool.map(x => x.slice(0, 24));

  for (const p of plan.filter(x => x.account === t.account)) {
    const e = [];
    if (H.includes(norm(p.text.split('\n')[0]))) e.push('1行目');
    if (S.includes(p.text.slice(0, 24))) e.push('先頭24字');
    const b = body(p.text);
    if (b && B.includes(b)) e.push('本文(地の文)');
    if (e.length) { console.log(`❌ ${p.time} ${t.account.padEnd(16)} 重複: ${e.join(' / ')}`); ng++; }
  }
}
console.log(ng ? `→ ${ng}件` : '✅ 重複なし（1行目・先頭24字・本文）');
process.exit(ng ? 1 : 0);
