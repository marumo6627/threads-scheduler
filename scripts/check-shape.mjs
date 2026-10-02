// 1行目の「構え」を分類し、同じアカウント内で同じ構えが連続していないか見る。
// 2026-10-03 追加。麗華型(対句)に全投稿を揃えたところ、1行目が対句一色になったため。
import { readFileSync } from 'node:fs';
const SHAPE = [
  ['Q 引用否定', t => /^[「『]/.test(t) || /[」』]と(言う|思う|思って)/.test(t)],
  ['G 問いかけ', t => /[？?]/.test(t)],
  ['K 肯定許可', t => /(ても|でも).{0,14}(間に合|育つ|取り返|できる|軽く|済む|変わる|残る|違う)/.test(t)],
  ['T 対句',     t => /(人|子|女|方)(は|ほど|だけが|から)/.test(t)],
];
// ruru の【見出し】は実測で確立した枠（1,953v vs 590v）なので外さない。
// 枠は固定したまま、中の構えを散らす必要があるので【】を剥がして分類する。
const shapeOf = t => {
  const inner = t.replace(/^【(.*)】.*$/, '$1');
  return (SHAPE.find(([, f]) => f(inner)) || ['— その他'])[0];
};
for (const d of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(`posts/${d}.json`, 'utf8'));
  const by = {};
  for (const p of P) (by[p.account] = by[p.account] || []).push(p);
  console.log(`\n████ ${d}`);
  let ng = 0;
  for (const acc of Object.keys(by)) {
    const rows = by[acc].sort((a, b) => (a.time < b.time ? -1 : 1))
      .map(p => ({ t: p.time, s: shapeOf(p.text.split('\n')[0]), h: p.text.split('\n')[0] }));
    console.log(`  ${acc}`);
    rows.forEach((r, i) => {
      const dup = i > 0 && rows[i - 1].s === r.s;
      if (dup) ng++;
      console.log(`    ${r.t} ${r.s.padEnd(10)}${dup ? ' ❌連続' : '        '} ${r.h.slice(0, 32)}`);
    });
    const c = {};
    for (const r of rows) c[r.s] = (c[r.s] || 0) + 1;
    console.log(`         → ${Object.entries(c).map(([k, v]) => `${k.split(' ')[0]}${v}`).join(' ')}`);
  }
  console.log(`  ${ng ? `❌ 連続 ${ng}件` : '✅ 同じ構えの連続なし'}`);
}
