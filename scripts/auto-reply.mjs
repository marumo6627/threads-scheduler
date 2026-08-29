// Threads コメント自動返信(状態レス)。REPLY_PARTS(返信テンプレJSON) と THREADS_TOKENS で動く。
// 重複防止: 返信直前に「そのコメントに自分が既に返信してないか」を API で確認。実行: node scripts/auto-reply.mjs [--dry]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.threads.net/v1.0';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const capArg = args.indexOf('--cap');
const RUN_CAP = capArg >= 0 ? Number(args[capArg + 1]) : Infinity; // 既定=上限なし。--cap で制限可
const POST_WINDOW_H = 40;   // 直近◯時間の自分の投稿のコメントだけ対象
const DELAY_MS = 3000;      // 返信ごとの間隔(スパム判定回避=本当のブレーキ)
const TIMEOUT_MS = 12000;
const PARTS = JSON.parse(process.env.REPLY_PARTS || readFileSync(join(HERE, 'reply_parts.json'), 'utf8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiCall(method, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, signal: ctrl.signal });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) { return { ok: false, status: 0, data: { error: { message: String(e.message || e) } } }; }
  finally { clearTimeout(t); }
}
function loadTokens() {
  const raw = process.env.THREADS_TOKENS || readFileSync(join(HERE, 'tokens.env'), 'utf8');
  return JSON.parse(raw).filter(t => t && t.account && t.access_token);
}
async function alreadyReplied(cid, myUser, tok) {
  const r = await apiCall('GET', `${API}/${cid}/replies?fields=username&access_token=${tok}`);
  if (!r.ok) return true; // 確認できない時は安全側=スキップ
  return (r.data.data || []).some(x => x.username === myUser);
}
async function main() {
  const tokens = loadTokens();
  const now = Date.now();
  let seq = 0, posted = 0; const summary = {};
  for (const acc of tokens) {
    if (posted >= RUN_CAP) break;
    const parts = PARTS[acc.account];
    if (!parts) continue; // テンプレのないアカはスキップ
    const tok = encodeURIComponent(acc.access_token);
    summary[acc.account] = 0;
    const meRes = await apiCall('GET', `${API}/me?fields=username&access_token=${tok}`);
    const myUser = meRes.ok ? meRes.data.username : null;
    if (!myUser) { console.log(`  [${acc.account}] トークン失効?`); continue; }
    const postsRes = await apiCall('GET', `${API}/me/threads?fields=id,timestamp&limit=25&access_token=${tok}`);
    const posts = (postsRes.ok && Array.isArray(postsRes.data.data) ? postsRes.data.data : [])
      .filter(p => { const ts = Date.parse(p.timestamp || ''); return p.id && !isNaN(ts) && (now - ts) <= POST_WINDOW_H * 3600 * 1000; });
    for (const p of posts) {
      if (posted >= RUN_CAP) break;
      const repRes = await apiCall('GET', `${API}/${p.id}/replies?fields=id,text,username,timestamp&limit=50&access_token=${tok}`);
      const comments = (repRes.ok && Array.isArray(repRes.data.data)) ? repRes.data.data : [];
      for (const c of comments) {
        if (posted >= RUN_CAP) break;
        const cid = String(c.id || ''); const text = String(c.text || ''); const user = String(c.username || '');
        if (!cid || !text.trim() || user === myUser) continue;
        if (await alreadyReplied(cid, myUser, tok)) continue;
        // open/mid/emoji を互いに素の乗数で回して near-dup を避ける
        const reply = parts.open[seq % parts.open.length] + parts.mid[(seq*3) % parts.mid.length] + parts.emoji[(seq*2+1) % parts.emoji.length];
        seq++;
        if (DRY) { console.log(`  [DRY][${acc.account}] @${user} → 「${reply}」`); posted++; summary[acc.account]++; continue; }
        const cr = await apiCall('POST', `${API}/me/threads?media_type=TEXT&text=${encodeURIComponent(reply)}&reply_to_id=${encodeURIComponent(cid)}&access_token=${tok}`);
        if (!cr.ok || !cr.data.id) continue;
        await sleep(2000);
        let published = false;
        for (let attempt = 0; attempt < 4 && !published; attempt++) {
          if (attempt > 0) await sleep(2500);
          const pub = await apiCall('POST', `${API}/me/threads_publish?creation_id=${encodeURIComponent(cr.data.id)}&access_token=${tok}`);
          if (pub.ok && pub.data.id) { published = true; break; }
        }
        if (!published) continue;
        posted++; summary[acc.account]++;
        await sleep(DELAY_MS);
      }
    }
  }
  console.log(`[auto-reply] 完了 / 今回返信=${posted}件 / ${JSON.stringify(summary)}`);
}
main().catch(e => { console.error('[auto-reply] 致命的エラー:', e); process.exit(1); });
