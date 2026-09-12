// 型の連続をチェックする。名前が違っても「読者から見て同じ型」は同一視する。
// 実行: node scripts/check-variety.mjs [YYYY-MM-DD]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const jst = new Date(Date.now() + 9 * 3600 * 1000);
const date = process.argv[2] || jst.toISOString().slice(0, 10);

// ★読者から見た型に正規化する。
//   「星座top3」「星座top5」「星座ランキング1〜4位」「短い星座ランキング」は
//   名前が違っても読者には全部「星座のランキング」に見えるので同一視する。
export function normKata(k) {
  const s = String(k).replace(/^★+\s*(主力|準主力)?\s*/, '').trim();
  if (/12\s*星座/.test(s)) return '12星座フル';
  if (/星座\s*(top|トップ)\s*\d|星座ランキング|星座\s*\d+位|短い星座/.test(s)) return '星座ランキング';
  if (/生まれ月|誕生月/.test(s)) return '生まれ月グルーピング';
  if (/星座グルーピング|グルーピング/.test(s)) return '星座グルーピング';
  if (/選択肢|回答|みくじ|3択|三択/.test(s)) return '選択肢';
  if (/対比|vs/i.test(s)) return '対比';
  if (/処方箋/.test(s)) return '処方箋';
  if (/時刻分岐|時間分岐/.test(s)) return '時刻分岐';
  if (/名前|漢字|頭文字/.test(s)) return '名前・漢字';
  return s;
}

const posts = JSON.parse(readFileSync(join(ROOT, 'posts', `${date}.json`), 'utf8'));
const byAcc = {};
for (const p of posts) (byAcc[p.account] = byAcc[p.account] || []).push(p);

let dup = 0;
console.log(`\n${date} 型の並び（読者視点で正規化）\n`);
// koala は使える型が「星座ランキング」1種しかない（2026-09-12 生まれ月廃止 /
// 時刻分岐は EXP-11・EXP-12 で 15v💬0・38v💬0 と不発）。連続は避けられないため除外する。
// 型が増えたらこの除外を外すこと。
const EXEMPT = { koala_spirit7: '使える型が星座ランキング1種のみ' };

for (const [acc, list] of Object.entries(byAcc)) {
  list.sort((a, b) => (a.time < b.time ? -1 : 1));
  console.log(`@${acc}${EXEMPT[acc] ? `  ※連続チェック除外（${EXEMPT[acc]}）` : ''}`);
  let prev = null;
  for (const p of list) {
    const k = normKata(p.kata);
    const same = prev === k;
    if (same && !EXEMPT[acc]) dup++;
    const mark = same ? (EXEMPT[acc] ? '⚠️ 連続' : '❌ 連続') : '     ';
    console.log(`  ${mark} ${p.time}  ${k.padEnd(14)} ${same ? `（元: ${p.kata}）` : ''}`);
    prev = k;
  }
  console.log('');
}
if (dup) {
  console.log(`❌ 同型の連続が ${dup}箇所。型を差し替えること。`);
  process.exit(1);
} else {
  console.log('✅ 同型の連続なし');
}
