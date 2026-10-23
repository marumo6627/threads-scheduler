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
// moon の挨拶と ruru の【】は、実測で確立した「枠」なので剥がして中身で判定する。
const shapeOf = t => {
  const inner = t.replace(/^【(.*)】.*$/, '$1')
                 .replace(/^(おはよう|おつかれさま|おやすみ前に|こんばんは|こんにちは)[。、]\s*/, '');
  return (SHAPE.find(([, f]) => f(inner)) || ['— その他'])[0];
};
// ★2026-10-11: 連続チェックを免除するアカウント。
// どれも「1行目の構えを固定すること」自体が実測の勝ち筋で、散らすと落ちる。
//   moon  1行目は挨拶（8月 219 vs 131・上位8本は8/8）
//   ruru  見出しは【今/今日/今夜〜】＋状態の名指し（9月 1974 vs それ以外）
//   ofuku 麗華型の核が同語反復の対句（上位8本の形）
// koala と rui は固定の勝ち筋が無いのでチェックを続ける。
const EXEMPT = {
  'moon.kyundaily': '1行目は挨拶で固定するのが勝ち筋',
  ruru_h11: '見出しは【今〜】＋状態の名指しで固定するのが勝ち筋',
  ofuku_kaiun: '麗華型の核が同語反復の対句',
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
    console.log(`  ${acc}${EXEMPT[acc] ? `  （連続チェック免除: ${EXEMPT[acc]}）` : ''}`);
    rows.forEach((r, i) => {
      const dup = i > 0 && rows[i - 1].s === r.s && !EXEMPT[acc];
      if (dup) ng++;
      console.log(`    ${r.t} ${r.s.padEnd(10)}${dup ? ' ❌連続' : '        '} ${r.h.slice(0, 32)}`);
    });
    const c = {};
    for (const r of rows) c[r.s] = (c[r.s] || 0) + 1;
    console.log(`         → ${Object.entries(c).map(([k, v]) => `${k.split(' ')[0]}${v}`).join(' ')}`);
  }
  console.log(`  ${ng ? `❌ 連続 ${ng}件` : '✅ 同じ構えの連続なし'}`);
}
