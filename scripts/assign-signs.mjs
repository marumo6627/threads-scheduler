// 星座の「1位」を全投稿横断で割り当て直す。
// 過去7日の実投稿を API から取得し、使用回数の少ない星座を優先する。
// 実行: node scripts/assign-signs.mjs <YYYY-MM-DD>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'https://graph.threads.net/v1.0';
const Z = ['おひつじ','おうし','ふたご','かに','しし','おとめ','てんびん','さそり','いて','やぎ','みずがめ','うお'];
const DAYS = 7;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const date = process.argv[2];
if (!date) { console.error('使い方: node scripts/assign-signs.mjs <YYYY-MM-DD>'); process.exit(1); }

const top = s => {
  const m = String(s).match(/(?:第?1位|🥇)[　\s]*([^\n　]+)座/);
  return m ? m[1] : null;
};
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// 過去DAYS日の実投稿から 1位 の使用実績を集める
const toks = JSON.parse(readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
const hist = [];   // {acc, ts, sign}
for (const t of toks) {
  const r = await fetch(`${A}/me/threads?fields=id,text,timestamp&limit=50&access_token=${encodeURIComponent(t.access_token)}`).then(x => x.json());
  for (const p of (r.data || [])) {
    const ts = Date.parse(p.timestamp || 0);
    if (ts < cutoff) continue;
    const s = top(p.text || '');
    if (s && Z.includes(s)) hist.push({ acc: t.account, ts, sign: s });
  }
  await sleep(250);
}
const histCount = {};
const histByAcc = {};
for (const h of hist) {
  histCount[h.sign] = (histCount[h.sign] || 0) + 1;
  (histByAcc[h.acc] = histByAcc[h.acc] || {})[h.sign] = (histByAcc[h.acc]?.[h.sign] || 0) + 1;
}
const recent = new Set(hist.filter(h => h.ts >= Date.now() - 36 * 3600 * 1000).map(h => h.sign));

console.log(`過去${DAYS}日の1位の実績（${hist.length}本）`);
for (const z of Z) console.log(`  ${z}座: ${histCount[z] || 0}回${recent.has(z) ? '  ← 直近36h内' : ''}`);

// 割り当て
const path = join(ROOT, 'posts', `${date}.json`);
const posts = JSON.parse(readFileSync(path, 'utf8'));
const targets = posts.filter(p => top(p.text)).sort((a, b) => (a.time < b.time ? -1 : 1));
const dayCount = {}, perAcc = {}, placed = [];
const assign = {};
for (const x of targets) {
  const m = mins(x.time), acc = x.account;
  // 枠数が12星座を超えるため再利用は不可避。
  // 「同アカ・同日の重複」だけを実質的な禁止とし、あとは使用回数を均すことを優先する。
  const score = z => {
    let s = 0;
    if ((perAcc[acc] || new Set()).has(z)) s += 1000;              // 同アカ・同日は実質禁止
    s += (histByAcc[acc]?.[z] || 0) * 30;                          // そのアカでの偏りを最優先で解消
    s += (histCount[z] || 0) * 8;                                  // 全体の偏り
    if (placed.some(([pm, pz]) => pz === z && Math.abs(pm - m) <= 180)) s += 25;  // 3時間以内の近接
    if (recent.has(z)) s += 15;                                    // 直近36h以内（弱いペナルティ）
    s += (dayCount[z] || 0) * 35;                                  // 同じ日に何度も1位にしない
    return [s, dayCount[z] || 0];
  };
  const z = Z.reduce((best, cur) => {
    const [bs, bd] = score(best), [cs, cd] = score(cur);
    return cs < bs || (cs === bs && cd < bd) ? cur : best;
  }, Z[0]);
  assign[x.time + x.account] = z;
  dayCount[z] = (dayCount[z] || 0) + 1;
  (perAcc[acc] = perAcc[acc] || new Set()).add(z);
  placed.push([m, z]);
}

let changed = 0;
for (const x of posts) {
  const cur = top(x.text);
  if (!cur) continue;
  const nw = assign[x.time + x.account];
  if (cur === nw) continue;
  x.text = x.text.replace(new RegExp(`${cur}座`, 'g'), '\x00')
                 .replace(new RegExp(`${nw}座`, 'g'), `${cur}座`)
                 .replaceAll('\x00', `${nw}座`);
  x.chars = x.text.length;
  changed++;
}
writeFileSync(path, JSON.stringify(posts, null, 2) + '\n');

console.log(`\n=== ${date} の割り当て（${changed}本を変更）===`);
for (const x of posts.sort((a, b) => (a.time < b.time ? -1 : 1))) {
  const t = top(x.text);
  if (t) console.log(`  ${x.time}  ${x.account.padEnd(15)} 1位=${t}座`);
}
