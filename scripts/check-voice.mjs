// アカウントごとに使ってはいけない語が混ざっていないか見る。
// 2026-10-07 追加。rui を関西弁で書き続けていたため（accounts/rui_blackmagic.md:92 に
// 「★語尾は関東寄りのギャル語。関西弁ではない（2026-09-01 訂正）」と明記がある）。
import { readFileSync } from 'node:fs';
const KANSAI = ['やろ', 'ちゃう', 'やない', 'へん', 'やから', 'やで', 'やし', 'ええわ', 'せやな', 'ねん'];
const NG = {
  // rui は関東ギャル語。関西弁は禁止。一人称「うち」は ruru の役
  rui_blackmagic: [...KANSAI, 'うちが', 'うちは', '〜とき', 'とくわ'],
  // koala は「〜といて」「〜とく」「〜とき」だけが署名。他の関西弁は入れない
  koala_spirit7: [...KANSAI, 'うちが', 'あんた'],
  // moon・ofuku は関西弁を一切使わない
  'moon.kyundaily': [...KANSAI, 'あんた', 'うちが'],
  ofuku_kaiun: [...KANSAI, 'あんた', 'うちが'],
  // ruru は関西弁が仕様。突き放しの「あんた」は rui の役なので使わない
  ruru_h11: ['あんた'],
};
const EMOJI = {
  rui_blackmagic: ['🖤', '💋', '🔮', '🕯️', '💜', '✨'],
};
// 「〜のうちに」は標準語なので一人称の「うち」と区別する
const clean = t => t.replace(/のうちに/g, '／');
let bad = 0;
for (const d of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(`posts/${d}.json`, 'utf8'));
  console.log(`\n████ ${d}`);
  for (const acc of [...new Set(P.map(p => p.account))]) {
    const rows = P.filter(p => p.account === acc);
    const hits = [];
    for (const p of rows) {
      const t = clean(p.text);
      for (const w of (NG[acc] || [])) if (t.includes(w)) hits.push(`${p.time}「${w}」`);
      const pool = EMOJI[acc];
      if (pool) for (const e of [...p.text.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map(m => m[0]))
        if (!pool.includes(e)) hits.push(`${p.time} 絵文字${e}`);
    }
    bad += hits.length;
    console.log(`  ${acc.padEnd(16)} ${hits.length ? '❌ ' + hits.join(' ') : '✅'}`);
  }
}
process.exit(bad ? 1 : 0);
