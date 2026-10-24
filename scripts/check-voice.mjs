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
  // shi_chan(紫苑) は上品な大阪敬語。一人称「わたし」二人称「あなた」。
  // タメ口は決め型として意図的に使うので禁止しない（直後に敬語へ戻す運用）。
  // 関東ギャル語と、他アカの一人称は禁止。
  shi_chan_178: ['じゃん', 'だからね', 'うちが', 'うちは', 'コアラ'],
};

// accounts/koala_spirit7.md の「脱力感を作るもの」。1本につき最低1つ入っていること
const MUST = {
  koala_spirit7: [
    ['緩衝語', ['まあ', '別に', 'とりあえず', 'だいたい', 'ちょっと', '一応', 'そんな感じ']],
    ['断定外し', ['かも', 'と思う', '気がする', '知らんけど', 'んじゃない']],
    ['コアラがだらけてる', ['コアラも', 'コアラ寝', '眠いけど']],
  ],
};
// ★2026-10-25: rui の1行目で主語が落ちて「なにこれ」になる投稿が多発（運用者指摘）。
// rui の主語は読者の名指し（〜女／〜子／あんた）。これが無いと指示対象が分からない。
//   ✕ その連絡、待ってる間に何が減った？      ← 誰の何の連絡か不明
//   ◯ 来ない連絡を待ってる間、あんたの時間が減ってるよ
// accounts/rui_blackmagic.md の「名指し◯（579 vs 125）」が効いているのは、
// 名指しがそのまま主語になっているから。
// ★2026-10-25 運用者指定: 「〜女」より「あんた」を主にする。
// 「〜女」「〜子」も主語としては成立するので検査は通すが、既定は「あんた」。
const NEED_SUBJECT = { rui_blackmagic: /あんた|女|子/ };
const PREFER_SUBJECT = { rui_blackmagic: /あんた/ };

// ★2026-10-22: 週を数える内部表現が本文に出ていた（実投稿 41/127本）。
// ★2026-10-25 運用者訂正: 禁止したいのは「日数の数え方」だけ。
//   「二日」「四日目」は、週の始まりが人や職種によって違うので解釈がずれる。
//   **「週の折り返し」「今週」は曜日と同じく誰が読んでも同じなので使っていい。**
//   （私が 折り返し まで禁止にしていたのは広げすぎだった。rui の全期間1位
//     4,148v「明日が折り返しって、気づいてた？」はこの形）
const BANNED_ALL = ['日目', '初日', '二日', '三日', '四日', '五日', '六日'];

const EMOJI = {
  rui_blackmagic: ['🖤', '💋', '🔮', '🕯️', '💜', '✨'],
  // 返信は投稿に合わせて 💜🌙🐈‍⬛（2026-10-15 運用者指定）。🥂 は鑑定書だけで使う
  shi_chan_178: ['💜', '🌙', '🐈‍⬛'],
};
// 「〜のうちに」は標準語なので一人称の「うち」と区別する
const clean = t => t.replace(/のうちに/g, '／');
let bad = 0;
for (const d of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(`posts/${d}.json`, 'utf8'));
  console.log(`\n████ ${d}`);
  for (const acc of [...new Set(P.map(p => p.account))]) {
    const rows = P.filter(p => p.account === acc);
    const hits = [], warn = [];
    for (const p of rows) {
      const t = clean(p.text);
      for (const w of (NG[acc] || [])) if (t.includes(w)) hits.push(`${p.time}「${w}」`);
      for (const w of BANNED_ALL) if (t.includes(w)) hits.push(`${p.time}「${w}」← 曜日で書く`);
      const pool = EMOJI[acc];
      if (pool) for (const e of [...p.text.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map(m => m[0]))
        if (!pool.includes(e)) hits.push(`${p.time} 絵文字${e}`);
    }
    for (const p of rows) {
      const sub = NEED_SUBJECT[acc];
      if (sub) {
        const head = (p.text.split('\n')[0] || '').replace(/^【[^】]*】/, '');
        if (!sub.test(head)) hits.push(`${p.time} 主語なし(あんた／〜女／〜子で名指しする)`);
        else if (PREFER_SUBJECT[acc] && !PREFER_SUBJECT[acc].test(head)) warn.push(`${p.time} 主語が「あんた」でない`);
      }
      const need = MUST[acc];
      if (!need) continue;
      if (!need.some(([, ws]) => ws.some(w => p.text.includes(w))))
        hits.push(`${p.time} 脱力なし(${need.map(([n]) => n).join('/')}が無い)`);
    }
    bad += hits.length;
    const note = warn.length ? '  ⚠ ' + warn.join(' ') : '';
    console.log(`  ${acc.padEnd(16)} ${hits.length ? '❌ ' + hits.join(' ') : '✅'}${note}`);
  }
}
process.exit(bad ? 1 : 0);
