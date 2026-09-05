// 指定日の posts/*.json が「投稿済みか未投稿か」を実データと突き合わせて表示する。
// 本文を修正する前に必ず実行すること。投稿済みを書き換えても直らず、二重投稿の原因になる。
// 実行: node scripts/check-posted.mjs [YYYY-MM-DD]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'https://graph.threads.net/v1.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const jst = new Date(Date.now() + 9 * 3600 * 1000);
const date = process.argv[2] || jst.toISOString().slice(0, 10);
const toks = JSON.parse(readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const posts = JSON.parse(readFileSync(join(ROOT, 'posts', `${date}.json`), 'utf8'));

const live = {};
for (const t of toks) {
  const r = await fetch(`${A}/me/threads?fields=id,text,timestamp,permalink&limit=50&access_token=${encodeURIComponent(t.access_token)}`).then(x => x.json());
  live[t.account] = (r.data || []).filter(p =>
    new Date(Date.parse(p.timestamp) + 9 * 3600 * 1000).toISOString().startsWith(date));
  await sleep(250);
}

const now = jst.toISOString().slice(11, 16);
let posted = 0, pending = 0;
console.log(`\n${date} の投稿状況（現在 ${now} JST）\n`);
for (const p of posts.sort((a, b) => (a.time < b.time ? -1 : 1))) {
  const hit = (live[p.account] || []).find(x => (x.text || '').slice(0, 24) === p.text.slice(0, 24));
  if (hit) {
    posted++;
    const t = new Date(Date.parse(hit.timestamp) + 9 * 3600 * 1000).toISOString().slice(11, 16);
    console.log(`  🔒 ${p.time} ${p.account.padEnd(15)} 投稿済 ${t}  ${hit.permalink}`);
  } else {
    pending++;
    console.log(`  ✏️  ${p.time} ${p.account.padEnd(15)} 未投稿（修正可）`);
  }
}
console.log(`\n  🔒 投稿済 ${posted}本 … 本文を書き換えても反映されない。書き換えると二重投稿になる`);
console.log(`  ✏️  未投稿 ${pending}本 … 修正可`);
if (posted) console.log(`\n  ⚠️ 投稿済みを直したい場合は Threads アプリから手動で削除・修正すること。`);
