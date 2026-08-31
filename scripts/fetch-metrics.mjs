// 投稿実績を取得して metrics/{日付}.md に保存する。/review の入力になる。
// 実行: node scripts/fetch-metrics.mjs [取得件数(既定50)]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'https://graph.threads.net/v1.0';
const LIMIT = Number(process.argv[2]) || 50;
const W = ['日', '月', '火', '水', '木', '金', '土'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const toks = JSON.parse(process.env.THREADS_TOKENS || readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
const today = jstNow.toISOString().slice(0, 10);

const rows = [];
for (const t of toks) {
  if (!t.access_token) continue;
  const tok = encodeURIComponent(t.access_token);
  const r = await fetch(`${A}/me/threads?fields=id,text,timestamp&limit=${LIMIT}&access_token=${tok}`).then(x => x.json());
  if (r.error) { console.error(`  ⚠️ ${t.account}: ${r.error.message}`); continue; }
  for (const p of (r.data || [])) {
    const ins = await fetch(`${A}/${p.id}/insights?metric=views,likes,replies,reposts,shares&access_token=${tok}`).then(x => x.json());
    const m = {};
    for (const x of (ins.data || [])) m[x.name] = x.values?.[0]?.value ?? 0;
    const j = new Date(Date.parse(p.timestamp) + 9 * 3600 * 1000);
    const eng = (m.likes || 0) + (m.replies || 0) + (m.reposts || 0);
    rows.push({
      account: t.account,
      date: j.toISOString().slice(0, 10),
      wd: W[j.getUTCDay()],
      time: j.toISOString().slice(11, 16),
      hour: j.getUTCHours(),
      views: m.views || 0, likes: m.likes || 0, replies: m.replies || 0, reposts: m.reposts || 0,
      er: m.views ? +(eng / m.views * 100).toFixed(1) : 0,
      head: (p.text || '').split('\n')[0].slice(0, 30),
      ageH: +((Date.now() - Date.parse(p.timestamp)) / 3600000).toFixed(1),
    });
    await sleep(200);
  }
}
rows.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));

const l = [];
l.push(`# 投稿実績 ${today}`, '', `取得 ${rows.length} 件 / ${new Date().toISOString()}`, '');
l.push('> ⚠️ 投稿から24時間未満のものは views が確定していない（集計遅延あり）。判定には使わない。', '');
l.push('## 投稿一覧（新しい順）', '');
l.push('| 日付 | 曜 | 時刻 | views | ♡ | 💬 | ER% | 経過h | 1行目 |');
l.push('|---|---|---|---|---|---|---|---|---|');
for (const x of rows) {
  const mark = x.ageH < 24 ? ' ⏳' : '';
  l.push(`| ${x.date} | ${x.wd} | ${x.time} | ${x.views}${mark} | ${x.likes} | ${x.replies} | ${x.er} | ${x.ageH} | ${x.head} |`);
}

const settled = rows.filter(x => x.ageH >= 24 && x.views > 0);
const agg = (pred, label) => {
  const by = {};
  for (const x of settled.filter(pred)) (by[x.hour] = by[x.hour] || []).push(x.views);
  const keys = Object.keys(by).sort((a, b) => a - b);
  if (!keys.length) return;
  l.push('', `### ${label}`, '', '| 時 | 平均views | n |', '|---|---|---|');
  for (const h of keys) {
    const v = by[h];
    l.push(`| ${h}時 | ${Math.round(v.reduce((s, y) => s + y, 0) / v.length)} | ${v.length} |`);
  }
};
l.push('', '## 集計（投稿24時間以降のみ）');
agg(x => !'土日'.includes(x.wd), '平日 時間帯別');
agg(x => '土日'.includes(x.wd), '土日 時間帯別');

if (settled.length) {
  const vs = settled.map(x => x.views).sort((a, b) => a - b);
  l.push('', `平均 ${Math.round(vs.reduce((s, v) => s + v, 0) / vs.length)} / 中央値 ${vs[Math.floor(vs.length / 2)]} / 最高 ${vs[vs.length - 1]} / n=${vs.length}`);
  const susp = settled.filter(x => x.er >= 25 && x.views < 50);
  if (susp.length) {
    l.push('', '### ⚠️ ER高×views低（抑制の疑い）', '');
    for (const x of susp) l.push(`- ${x.date} ${x.time} views ${x.views} / ER ${x.er}% — ${x.head}`);
  }
}

mkdirSync(join(ROOT, 'metrics'), { recursive: true });
const out = join(ROOT, 'metrics', `${today}.md`);
writeFileSync(out, l.join('\n') + '\n');
console.log(`✅ metrics/${today}.md に ${rows.length} 件を保存`);
