// 翌日分が POSTS_JSON に入っているかを確認し、入っていなければ失敗させる。
// 2026-09-11/12 に生成を忘れて午前の枠を23枠落とし、全4アカが同時に急落したため追加。
// GitHub の schedule は当てにならないので post-scheduler(cron-job.org が15分ごとに起動)に相乗りする。
// 実行: node scripts/check-tomorrow.mjs [--force]
import zlib from 'node:zlib';

const FORCE = process.argv.includes('--force');
// 通知が15分ごとに鳴り続けないよう、JST 20時台/22時台/23時台の最初の実行だけ見る
const ALERT_HOURS = [20, 22, 23];

const jst = new Date(Date.now() + 9 * 3600 * 1000);
const h = jst.getUTCHours(), m = jst.getUTCMinutes();
if (!FORCE && !(ALERT_HOURS.includes(h) && m < 15)) {
  console.log(`[check-tomorrow] JST ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} は確認時刻外。スキップ`);
  process.exit(0);
}

const tomorrow = new Date(jst.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
if (!process.env.POSTS_JSON) {
  console.error('::error::[check-tomorrow] POSTS_JSON が渡されていません');
  process.exit(1);
}
const parsed = JSON.parse(zlib.gunzipSync(Buffer.from(process.env.POSTS_JSON, 'base64')).toString('utf8'));
const arr = Array.isArray(parsed)
  ? parsed.filter(p => p.date === tomorrow)
  : (parsed[tomorrow] || []);

const MIN = Number(process.env.MIN_POSTS || 20);
if (arr.length >= MIN) {
  console.log(`[check-tomorrow] ✅ ${tomorrow} は ${arr.length}本 入っています`);
  process.exit(0);
}

console.error(`::error::[check-tomorrow] 翌日(${tomorrow})が ${arr.length}本 しかありません（最低 ${MIN}本）`);
console.error(`  今夜のうちに生成しないと、明日の午前の枠を落とします。`);
console.error(`  GRACE_MIN=180 のため、翌朝に気づいても過ぎた枠は一斉投稿になるので使えません。`);
console.error(`  → /today ${tomorrow} で生成し、node scripts/publish-day.mjs <当日> ${tomorrow} で反映`);
process.exit(1);
