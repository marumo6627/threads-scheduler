// アカウントごとに使ってはいけない語が混ざっていないか見る。
// 2026-10-07 追加。rui を関西弁で書き続けていたため（accounts/rui_blackmagic.md:92 に
// 「★語尾は関東寄りのギャル語。関西弁ではない（2026-09-01 訂正）」と明記がある）。
import { readFileSync } from 'node:fs';
const KANSAI = ['やろ', 'ちゃう', 'やない', 'へん', 'やから', 'やで', 'やし', 'ええわ', 'せやな', 'ねん'];
// ★2026-10-07 訂正: 最初に書いた版は koala の関西弁と ruru の「あんた」を禁止していたが、
// どちらもペルソナ原本では正規だった。禁止語は原本に書いてあるものだけにする。
//   accounts/koala_spirit7.md:54「脱力感が最優先。関西弁は手段のひとつにすぎない」
//   accounts/ruru_h11.md:15「一人称「うち」、二人称「あんた」」
const NG = {
  // accounts/rui_blackmagic.md:92「語尾は関東寄りのギャル語。関西弁ではない」
  rui_blackmagic: [...KANSAI, 'うちが', 'うちは', 'とくわ', 'したるわ'],
  // moon・ofuku に関西弁・ギャル語の設定はない
  'moon.kyundaily': [...KANSAI, 'あんた', 'うちが', 'じゃん'],
  ofuku_kaiun: [...KANSAI, 'あんた', 'うちが', 'じゃん'],
  // ruru は関西弁。関東ギャル語は rui の役
  ruru_h11: ['じゃん', 'でしょ？', 'だからね'],
  // koala は関西弁も標準語も可。禁止語はない（下の必須チェックで見る）
  koala_spirit7: [],
};

// accounts/koala_spirit7.md の「脱力感を作るもの」。1本につき最低1つ入っていること
const MUST = {
  koala_spirit7: [
    ['緩衝語', ['まあ', '別に', 'とりあえず', 'だいたい', 'ちょっと', '一応', 'そんな感じ']],
    ['断定外し', ['かも', 'と思う', '気がする', '知らんけど', 'んじゃない']],
    ['コアラがだらけてる', ['コアラも', 'コアラ寝', '眠いけど']],
  ],
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
    for (const p of rows) {
      const need = MUST[acc];
      if (!need) continue;
      if (!need.some(([, ws]) => ws.some(w => p.text.includes(w))))
        hits.push(`${p.time} 脱力なし(${need.map(([n]) => n).join('/')}が無い)`);
    }
    bad += hits.length;
    console.log(`  ${acc.padEnd(16)} ${hits.length ? '❌ ' + hits.join(' ') : '✅'}`);
  }
}
process.exit(bad ? 1 : 0);
