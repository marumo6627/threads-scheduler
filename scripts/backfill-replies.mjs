#!/usr/bin/env node
// 窓の外に取り残された未返信コメントを古い順に消化する（手動実行の掃除用）。
//
//   node scripts/backfill-replies.mjs --account ofuku_kaiun --days 21 --cap 60 [--dry]
//
// auto-reply.mjs は POST_WINDOW_H（既定96h）より古い投稿を見ないので、
// アプリの「未返信」欄には窓の外のコメントが永久に残る。これを拾う。
// ★DELAY_MS は auto-reply と同じ3秒。ここを詰めない（アカBANが最大リスク）。
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://graph.threads.net/v1.0';
const DELAY_MS = 3000;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ACC = opt('--account');
const DAYS = Number(opt('--days', 21));
const CAP = Number(opt('--cap', 60));
// auto-reply.mjs が見る窓（POST_WINDOW_H）より新しい投稿は触らない。
// 同じコメントに cron と二重に返信しないため。既定4日=96h。
const MIN_AGE_D = Number(opt('--min-age', 4));
const DRY = args.includes('--dry');
if (!ACC) { console.error('--account は必須'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = async (u, method = 'GET') => {
  const r = await fetch(u, { method });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d, err: d?.error?.message || '' };
};

const root = path.resolve(import.meta.dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'scripts/tokens.env'), 'utf8'));
const PARTS = JSON.parse(fs.readFileSync(path.join(root, 'scripts/reply_parts.json'), 'utf8'));
const entry = tokens.find(t => t.account === ACC);
if (!entry) { console.error(`${ACC} のトークンがない`); process.exit(1); }
const parts = PARTS[ACC];
if (!parts) { console.error(`${ACC} の reply_parts がない`); process.exit(1); }
const tok = encodeURIComponent(entry.access_token);
const now = Date.now();

const me = (await J(`${API}/me?fields=username&access_token=${tok}`)).d.username;
if (!me) { console.error('トークン失効?'); process.exit(1); }

// 自分が返した親コメントID
const replied = new Set();
{
  let u = `${API}/me/replies?fields=id,replied_to,timestamp&limit=100&access_token=${tok}`;
  while (u) {
    const r = await J(u); let stop = false;
    for (const p of r.d.data || []) {
      if (Date.parse(p.timestamp) < now - (DAYS + 3) * 86400e3) { stop = true; break; }
      if (p.replied_to?.id) replied.add(String(p.replied_to.id));
    }
    if (stop) break;
    u = r.d.paging?.next || null;
  }
}
console.log(`[backfill] ${ACC} / 返信済みの親 ${replied.size}件 / ${MIN_AGE_D}〜${DAYS}日前が対象 / 上限 ${CAP}件`);

// 対象投稿（新しい順に返ってくる）
const posts = [];
{
  let u = `${API}/me/threads?fields=id,timestamp&limit=100&access_token=${tok}`;
  while (u) {
    const r = await J(u); let stop = false;
    for (const p of r.d.data || []) {
      const ts = Date.parse(p.timestamp);
      if (ts < now - DAYS * 86400e3) { stop = true; break; }
      if (ts > now - MIN_AGE_D * 86400e3) continue;   // cron の担当範囲
      posts.push(p);
    }
    if (stop) break;
    u = r.d.paging?.next || null;
  }
}

// 未返信コメントを集める。同一ユーザーの回数も数える（常連判定用）
const seen = {}, queue = [];
for (const p of posts) {
  let u = `${API}/${p.id}/replies?fields=id,text,username,timestamp&limit=100&access_token=${tok}`;
  while (u) {
    const r = await J(u);
    for (const c of r.d.data || []) {
      const cid = String(c.id || ''), text = String(c.text || ''), user = String(c.username || '');
      if (!cid || !text.trim() || user === me) continue;
      seen[user] = (seen[user] || 0) + 1;
      if (replied.has(cid)) continue;
      queue.push({ cid, user, text, ts: Date.parse(c.timestamp || '') || 0 });
    }
    u = r.d.paging?.next || null;
  }
}
queue.sort((a, b) => a.ts - b.ts);   // 一番待たせている人から
console.log(`[backfill] 未返信 ${queue.length}件`);

const REPEAT_MIN = Number(process.env.REPEAT_MIN || 3);
let seq = 0, posted = 0;
for (const c of queue) {
  if (posted >= CAP) break;
  // コメント欄に「鑑定」と書いている人は場所の案内を出す
  const wantsGuide = /鑑定/.test(c.text) && Array.isArray(parts.guide) && parts.guide.length;
  const isRepeat = (seen[c.user] || 0) >= REPEAT_MIN && Array.isArray(parts.repeat) && parts.repeat.length;
  let reply;
  if (wantsGuide) reply = parts.guide[seq % parts.guide.length];
  else if (isRepeat) reply = parts.repeat[seq % parts.repeat.length];
  else {
    const head = parts.open[seq % parts.open.length] + parts.mid[(seq * 3) % parts.mid.length];
    const cand = parts.emoji.filter(e => !head.includes(e));
    const pool = cand.length ? cand : parts.emoji;
    reply = head + pool[Math.floor(seq / parts.open.length) % pool.length];
  }
  seq++;
  const age = ((now - c.ts) / 86400e3).toFixed(1);
  if (DRY) { console.log(`  [DRY] @${c.user}(${seen[c.user]}回/${age}日前)${wantsGuide ? '[鑑定]' : isRepeat ? '[常連]' : ''} → 「${reply}」`); posted++; continue; }
  const cr = await J(`${API}/me/threads?media_type=TEXT&text=${encodeURIComponent(reply)}&reply_to_id=${encodeURIComponent(c.cid)}&access_token=${tok}`, 'POST');
  if (!cr.ok || !cr.d.id) { console.log(`  × 作成失敗 @${c.user} ${cr.err}`); await sleep(DELAY_MS); continue; }
  await sleep(2000);
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    if (i) await sleep(2500);
    const pub = await J(`${API}/me/threads_publish?creation_id=${encodeURIComponent(cr.d.id)}&access_token=${tok}`, 'POST');
    if (pub.ok && pub.d.id) ok = true;
  }
  if (!ok) { console.log(`  × 公開失敗 @${c.user}`); await sleep(DELAY_MS); continue; }
  posted++;
  if (posted % 10 === 0) console.log(`  … ${posted}/${Math.min(queue.length, CAP)}`);
  await sleep(DELAY_MS);
}
console.log(`[backfill] 完了 / 返信 ${posted}件 / 残り ${Math.max(0, queue.length - posted)}件`);
