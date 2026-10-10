// 前日の同じ枠と「完全に同じ行」がどれだけあるかを見る。
// 2026-10-10 追加。moon が44〜63%で他アカ(15〜34%)の2倍だった。
// 投稿ごとの文面は違っても、固定ブロック(時刻分岐の選択肢・CTA・期限行)が
// 毎日そのまま出ていると反復コンテンツになる。
import { readFileSync, existsSync } from 'node:fs';
const LIMIT = Number(process.env.REPEAT_MAX || 35);  // 一致率の上限(%)
const load = d => existsSync(`posts/${d}.json`) ? JSON.parse(readFileSync(`posts/${d}.json`, 'utf8')) : [];
const prevDay = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
const lines = t => t.split('\n').filter(l => l.trim());

let ng = 0;
for (const d of process.argv.slice(2)) {
  const cur = load(d);
  let prev = load(prevDay(d));
  if (!prev.length) { const p2 = prevDay(prevDay(d)); prev = load(p2); }
  if (!prev.length) { console.log(`\n████ ${d}  前日の在庫が無いので比較できません`); continue; }
  console.log(`\n████ ${d}`);
  for (const acc of [...new Set(cur.map(p => p.account))]) {
    const rows = [];
    for (const c of cur.filter(p => p.account === acc)) {
      const p = prev.find(x => x.account === acc && x.time === c.time);
      if (!p) continue;
      const A = lines(p.text), B = new Set(lines(c.text));
      const same = A.filter(l => B.has(l));
      rows.push({ time: c.time, rate: Math.round(same.length / Math.max(A.length, B.size) * 100), same });
    }
    if (!rows.length) continue;
    const avg = Math.round(rows.reduce((s, r) => s + r.rate, 0) / rows.length);
    const worst = rows.sort((a, b) => b.rate - a.rate)[0];
    const bad = avg > LIMIT;
    if (bad) ng++;
    console.log(`  ${acc.padEnd(16)} 平均${String(avg).padStart(3)}%  最悪 ${worst.time} ${worst.rate}%  ${bad ? `❌ ${LIMIT}%超` : '✅'}`);
    if (bad) for (const l of worst.same.slice(0, 4)) console.log(`      毎日同じ: ${l}`);
  }
}
process.exit(ng ? 1 : 0);
