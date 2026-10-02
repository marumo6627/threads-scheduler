// 星座ランキングの1〜3位を全投稿横断で割り当て直す。
// 2026-10-02 全面改修。それまでの実装には4つの不具合があった:
//   ① ひらがな表記しか扱えず、漢字で書く ruru では1位だけひらがなに置換され
//      「さそり座 / 射手座 / 蠍座」のように同じ星座が1投稿に2回出ていた
//   ② 1位だけを散らすため、2位・3位が毎日まったく同じ組み合わせで固定されていた
//   ③ 当日分の中だけで散らしていたので、日をまたぐと同じ組み合わせが何度も出た
//      （ofuku の「おうし/みずがめ/いて」は5日間で4回出ていた）
//   ④ 当日分に実行すると投稿済みの本文を書き換えて二重投稿を起こす
//
// 実行:
//   node scripts/assign-signs.mjs 2026-10-03              … 翌日分を割り当て
//   node scripts/assign-signs.mjs 2026-10-02 --after 15:40 … 当日の未投稿枠だけ
//   node scripts/assign-signs.mjs 2026-10-02 --check       … 書き換えずに検査のみ
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'https://graph.threads.net/v1.0';
const DAYS = 7;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ひらがな/漢字の対応。配列の index が正規形
const Z = [
  { h: 'おひつじ', k: '牡羊' }, { h: 'おうし', k: '牡牛' },   { h: 'ふたご', k: '双子' },
  { h: 'かに', k: '蟹' },       { h: 'しし', k: '獅子' },     { h: 'おとめ', k: '乙女' },
  { h: 'てんびん', k: '天秤' }, { h: 'さそり', k: '蠍' },     { h: 'いて', k: '射手' },
  { h: 'やぎ', k: '山羊' },     { h: 'みずがめ', k: '水瓶' }, { h: 'うお', k: '魚' },
];
const idxOf = name => Z.findIndex(z => z.h === name || z.k === name);
const RANK = /^(第?[123]位)[　 ]*([^\n　 ]+?)座/gm;
const ranksOf = t => [...t.matchAll(RANK)]
  .map(m => ({ label: m[1], name: m[2], i: idxOf(m[2]) })).filter(x => x.i >= 0);
const isKanji = t => Z.some(z => t.includes(z.k + '座'));
const trioKey = ix => [...ix].sort((a, b) => a - b).join(',');

const date = process.argv[2];
const check = process.argv.includes('--check');
const afterIx = process.argv.indexOf('--after');
const after = afterIx > 0 ? process.argv[afterIx + 1] : null;
if (!date) { console.error('使い方: node scripts/assign-signs.mjs <YYYY-MM-DD> [--after HH:MM] [--check]'); process.exit(1); }

// ★当日以前は、投稿済みの本文を書き換えると二重投稿になる（2026-10-02 に実際に発生）
const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
if (date <= todayJst && !after && !check) {
  console.error(`::error::[assign-signs] ${date} は当日以前です。投稿済みの本文を書き換えると二重投稿になります`);
  console.error(`  未投稿分だけ直す場合は --after HH:MM を付けてください（現在 JST ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)}）`);
  process.exit(1);
}

const path = join(ROOT, 'posts', `${date}.json`);
const posts = JSON.parse(readFileSync(path, 'utf8'));

// ── 過去DAYS日の実投稿から履歴を集める ──────────────────────────
const toks = JSON.parse(readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
const histAcc = {};        // acc -> {idx: 回数}
const histAll = {};        // idx -> 回数
const histSlot = {};       // "acc HH:MM" -> Set(idx)   同じ枠に同じ星座を続けない
const pastTrios = new Set();
for (const t of toks) {
  const r = await fetch(`${A}/me/threads?fields=id,text,timestamp,is_reply&limit=80&access_token=${encodeURIComponent(t.access_token)}`)
    .then(x => x.json()).catch(() => ({}));
  for (const p of (r.data || [])) {
    if (p.is_reply || Date.parse(p.timestamp || 0) < cutoff) continue;
    const rk = ranksOf(p.text || '');
    if (!rk.length) continue;
    const jst = new Date(Date.parse(p.timestamp) + 9 * 3600 * 1000).toISOString();
    if (jst.slice(0, 10) === date) continue;               // 当日分は履歴に入れない
    if (rk.length >= 3) pastTrios.add(trioKey(rk.slice(0, 3).map(x => x.i)));
    const slot = `${t.account} ${jst.slice(11, 16)}`;
    for (const x of rk) {
      histAcc[t.account] = histAcc[t.account] || {};
      histAcc[t.account][x.i] = (histAcc[t.account][x.i] || 0) + 1;
      histAll[x.i] = (histAll[x.i] || 0) + 1;
      (histSlot[slot] = histSlot[slot] || new Set()).add(x.i);
    }
  }
  await sleep(200);
}

// ── 割り当て ─────────────────────────────────────────────
const mins = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const targets = posts
  .filter(p => ranksOf(p.text).length >= 3)
  .filter(p => !after || mins(p.time) > mins(after))
  .sort((a, b) => mins(a.time) - mins(b.time));

const dayCount = {}, perAcc = {}, placed = [];
const trios = new Set(pastTrios);
// 当日の対象外（既に投稿済み・--after で除外した分）も衝突回避の対象に入れる
for (const p of posts) {
  const rk = ranksOf(p.text);
  if (rk.length < 3 || targets.includes(p)) continue;
  trios.add(trioKey(rk.slice(0, 3).map(x => x.i)));
  for (const x of rk) {
    dayCount[x.i] = (dayCount[x.i] || 0) + 1;
    (perAcc[p.account] = perAcc[p.account] || {})[x.i] = ((perAcc[p.account] || {})[x.i] || 0) + 1;
    placed.push([mins(p.time), x.i]);
  }
}

for (const p of targets) {
  const acc = p.account, m = mins(p.time);
  const slotSeen = histSlot[`${acc} ${p.time}`] || new Set();
  const pick = [];
  for (let slot = 0; slot < 3; slot++) {
    let best = -1, bs = Infinity;
    for (let i = 0; i < 12; i++) {
      if (pick.includes(i)) continue;                             // 同じ投稿内の重複は禁止（最優先）
      let s = 0;
      s += (dayCount[i] || 0) * 60;                               // 同じ日に何度も出さない
      s += ((perAcc[acc] || {})[i] || 0) * 120;                   // 同アカ同日はさらに避ける
      s += ((histAcc[acc] || {})[i] || 0) * 20;                   // そのアカの直近7日の偏り
      s += (histAll[i] || 0) * 5;                                 // 全アカ合計の偏り
      if (slotSeen.has(i)) s += 90;                               // 同じ枠に同じ星座を続けない
      if (placed.some(([pm, pi]) => pi === i && Math.abs(pm - m) <= 180)) s += 40;  // 前後3時間
      if (s < bs) { bs = s; best = i; }
    }
    pick.push(best);
  }
  // 過去7日＋当日に同じ3つの組み合わせがあれば、3位→2位の順に入れ替える
  for (const n of [2, 1]) {
    if (!trios.has(trioKey(pick))) break;
    const orig = pick[n];
    let found = false;
    for (let i = 0; i < 12; i++) {
      if (pick.includes(i)) continue;
      pick[n] = i;
      if (!trios.has(trioKey(pick))) { found = true; break; }
    }
    if (!found) pick[n] = orig;
  }
  trios.add(trioKey(pick));
  for (const i of pick) {
    dayCount[i] = (dayCount[i] || 0) + 1;
    (perAcc[acc] = perAcc[acc] || {})[i] = ((perAcc[acc] || {})[i] || 0) + 1;
    placed.push([m, i]);
  }

  // 本文を書き換える。表記はその投稿に合わせて統一する（混在していたら漢字に寄せる）
  const kanji = isKanji(p.text);
  const sep = kanji ? ' ' : '　';
  const cur = ranksOf(p.text);
  let txt = p.text, before = cur.map(c => c.name + '座').join(' / ');
  cur.slice(0, 3).forEach((c, n) => {
    txt = txt.replace(new RegExp(`^(${c.label})[　 ]*${c.name}座`, 'm'), `$1${sep}${Z[pick[n]][kanji ? 'k' : 'h']}座`);
  });
  p.text = txt;
  p.chars = [...txt].length;
  p._before = before;
  p._after = pick.map(i => Z[i][kanji ? 'k' : 'h'] + '座').join(' / ');
}

// ── 出力 ─────────────────────────────────────────────────
console.log(`=== ${date} ${after ? `(${after} より後) ` : ''}${targets.length}本 ===`);
for (const p of targets) {
  const ch = p._before !== p._after;
  console.log(`  ${p.time} ${p.account.slice(0, 14).padEnd(15)} ${p._after.padEnd(26)}${ch ? `  ← ${p._before}` : '  (変更なし)'}`);
}
const bad = targets.filter(p => new Set(ranksOf(p.text).slice(0, 3).map(x => x.i)).size !== 3);
const mix = targets.filter(p => { const r = ranksOf(p.text); return r.some(x => Z[x.i].k === x.name) && r.some(x => Z[x.i].h === x.name); });
const c = {};
for (const p of posts) for (const x of ranksOf(p.text)) c[x.i] = (c[x.i] || 0) + 1;
const tot = Object.values(c).reduce((a, b) => a + b, 0);
console.log(`\n${date} 全体: ${tot}枠 / ${Object.keys(c).length}種 / 最多${Math.max(...Object.values(c))}回・最少${Math.min(...Object.values(c))}回`);
console.log(bad.length ? `❌ 投稿内で重複: ${bad.map(p => p.time).join(' ')}` : '✅ 投稿内の重複なし');
console.log(mix.length ? `❌ 表記が混在: ${mix.map(p => p.time).join(' ')}` : '✅ ひらがな/漢字の混在なし');
const seen = new Set(pastTrios), rep = [];
for (const p of posts) { const r = ranksOf(p.text); if (r.length < 3) continue; const k = trioKey(r.slice(0, 3).map(x => x.i)); if (seen.has(k)) rep.push(`${p.account} ${p.time}`); seen.add(k); }
console.log(rep.length ? `❌ 過去7日と同じ組み合わせ: ${rep.join(' / ')}` : '✅ 過去7日と同じ組み合わせなし');

if (check) { console.log('\n--check のためファイルは書き換えていません'); process.exit(bad.length || mix.length || rep.length ? 1 : 0); }
writeFileSync(path, JSON.stringify(posts.map(({ _before, _after, ...r }) => r), null, 2) + '\n');
console.log(`\n✅ posts/${date}.json を更新`);
