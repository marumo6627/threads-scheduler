// 投稿の「骨格」が1種類に収束していないか見る。
// 2026-10-09 追加。文面は重複していないのに、
//   フック／順位3行／地の文1行／期限行／CTA
// という同じ型紙が71%(79/111本)を占めていた。読者には同じ形に見える。
import { readFileSync } from 'node:fs';
const role = l =>
  /^第?[123]位/.test(l) ? 'R' :                      // 順位行
  /^『|時台/.test(l) ? 'B' :                          // 時刻分岐の選択肢
  /置い[てたとい]|置いていき|数えてって/.test(l) ? 'C' : // CTA
  /までに|うちに|今から|前に|したら/.test(l) ? 'D' :    // 期限行
  'T';                                                // フック・地の文
const skel = t => t.split('\n').filter(l => l.trim()).map(role).join('');
const LIMIT = Number(process.env.SKEL_MAX || 45);     // 1種類の上限(%)

let ng = 0;
for (const d of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(`posts/${d}.json`, 'utf8'));
  const c = {}, dl = {}, cta = {};
  for (const p of P) {
    c[skel(p.text)] = (c[skel(p.text)] || 0) + 1;
    const L = p.text.split('\n').filter(l => l.trim());
    const dline = L.find(l => role(l) === 'D');
    if (dline) dl[dline.slice(0, 10)] = (dl[dline.slice(0, 10)] || 0) + 1;
    cta[L[L.length - 1].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '◯')] = 1;
  }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const share = top[0][1] / P.length * 100;
  const one = P.filter(p => /一個だけ|ひとつだけ|一つだけ/.test(p.text)).length;
  console.log(`\n████ ${d}  ${P.length}本`);
  for (const [k, n] of top) console.log(`  ${k.padEnd(12)} ${String(n).padStart(3)}本 ${(n / P.length * 100).toFixed(0)}%`);
  console.log(`  骨格 ${top.length}種 / 最多 ${share.toFixed(0)}%  ${share > LIMIT ? `❌ ${LIMIT}%超` : '✅'}`);
  console.log(`  期限行 ${Object.keys(dl).length}種 / CTA ${Object.keys(cta).length}種`);
  console.log(`  「一個だけ」系 ${one}本 ${(one / P.length * 100).toFixed(0)}%  ${one / P.length > 0.5 ? '❌ 半分超' : '✅'}`);
  if (share > LIMIT || one / P.length > 0.5) ng++;
}
process.exit(ng ? 1 : 0);
