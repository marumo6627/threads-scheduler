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
const RUN_CAP = capArg >= 0 ? Number(args[capArg + 1]) : Infinity; // ★アカウントごとの上限。
// 2026-09-06: 全体上限だと配列の後ろのアカ(ofuku)に永久に到達しない不具合があったため、アカ単位に変更
const POST_WINDOW_H = 40;   // 直近◯時間の自分の投稿のコメントだけ対象
// ★何回目のコメントから常連向けの文面に切り替えるか(2026-09-14)。4アカ横断で数える。
// 332人が複数アカにコメントしており、毎回同じ誘導文を返すとテンプレだと分かられる。
// DM誘導自体は常連向けにも残す(運用者判断)。文面だけ「また来てくれたね」型に変える。
const REPEAT_MIN = Number(process.env.REPEAT_MIN || 3);
const MAX_PAGES = 8;        // コメント取得のページ上限(=最大800件/投稿)
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
// コメントを全件たどる。limit=50 で打ち切ると古いコメントが永久に見えなくなる（2026-09-10 修正）
async function fetchAllComments(postId, tok) {
  const out = [];
  let url = `${API}/${postId}/replies?fields=id,text,username,timestamp,has_replies&limit=100&access_token=${tok}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const r = await apiCall('GET', url);
    if (!r.ok || !Array.isArray(r.data.data)) break;
    out.push(...r.data.data);
    url = r.data.paging?.next || null;
  }
  return out;
}
async function alreadyReplied(cid, myUser, tok) {
  const r = await apiCall('GET', `${API}/${cid}/replies?fields=username&access_token=${tok}`);
  if (!r.ok) return true; // 確認できない時は安全側=スキップ
  return (r.data.data || []).some(x => x.username === myUser);
}
async function main() {
  const tokens = loadTokens();
  const now = Date.now();
  let seq = 0, posted = 0; const summary = {}; let repeatSkipped = 0;

  // ── 1周目: 全アカのコメントを集め、username を横断で数える ──
  const perAcc = [];
  const userCount = {};
  for (const acc of tokens) {
    const parts = PARTS[acc.account];
    if (!parts) continue;
    const tok = encodeURIComponent(acc.access_token);
    const meRes = await apiCall('GET', `${API}/me?fields=username&access_token=${tok}`);
    const myUser = meRes.ok ? meRes.data.username : null;
    if (!myUser) { console.log(`  [${acc.account}] トークン失効?`); continue; }
    const postsRes = await apiCall('GET', `${API}/me/threads?fields=id,timestamp&limit=25&access_token=${tok}`);
    const posts = (postsRes.ok && Array.isArray(postsRes.data.data) ? postsRes.data.data : [])
      .filter(p => { const ts = Date.parse(p.timestamp || ''); return p.id && !isNaN(ts) && (now - ts) <= POST_WINDOW_H * 3600 * 1000; });
    const queue = [];
    for (const p of posts) {
      for (const c of await fetchAllComments(p.id, tok)) {
        const cid = String(c.id || ''), text = String(c.text || ''), user = String(c.username || '');
        if (!cid || !text.trim() || user === myUser) continue;
        userCount[user] = (userCount[user] || 0) + 1;   // ★返信済みも含めて数える
        if (c.has_replies === true) continue;
        queue.push({ cid, user, ts: Date.parse(c.timestamp || '') || 0 });
      }
    }
    queue.sort((a, b) => a.ts - b.ts);   // 古い順＝待たせている人から返す
    perAcc.push({ acc, tok, myUser, parts, queue });
  }

  // ── 2周目: 返信する ──
  for (const { acc, tok, myUser, parts, queue } of perAcc) {
    let accPosted = 0;
    summary[acc.account] = 0;
    const waiting = queue.length;
    for (const c of queue) {
      if (accPosted >= RUN_CAP) break;
      if (await alreadyReplied(c.cid, myUser, tok)) continue;

      // ★繰り返しコメントしている人にはDM誘導を出さない(2026-09-14)
      const isRepeat = (userCount[c.user] || 0) >= REPEAT_MIN && Array.isArray(parts.repeat) && parts.repeat.length;
      let reply;
      if (isRepeat) {
        reply = parts.repeat[seq % parts.repeat.length];
        repeatSkipped++;
      } else {
        // emoji は open が一周してから進める(open と連動させないため)
        reply = parts.open[seq % parts.open.length]
          + parts.mid[(seq * 3) % parts.mid.length]
          + parts.emoji[Math.floor(seq / parts.open.length) % parts.emoji.length];
      }
      seq++;

      if (DRY) { console.log(`  [DRY][${acc.account}] @${c.user}(${userCount[c.user]}回)${isRepeat ? '[常連]' : ''} → 「${reply}」`); posted++; accPosted++; summary[acc.account]++; continue; }
      const cr = await apiCall('POST', `${API}/me/threads?media_type=TEXT&text=${encodeURIComponent(reply)}&reply_to_id=${encodeURIComponent(c.cid)}&access_token=${tok}`);
      if (!cr.ok || !cr.data.id) continue;
      await sleep(2000);
      let published = false;
      for (let attempt = 0; attempt < 4 && !published; attempt++) {
        if (attempt > 0) await sleep(2500);
        const pub = await apiCall('POST', `${API}/me/threads_publish?creation_id=${encodeURIComponent(cr.data.id)}&access_token=${tok}`);
        if (pub.ok && pub.data.id) { published = true; break; }
      }
      if (!published) continue;
      posted++; accPosted++; summary[acc.account]++;
      await sleep(DELAY_MS);
    }
    if (waiting > accPosted) console.log(`  [${acc.account}] 未返信の残り ${waiting - accPosted}件（今回 ${accPosted}件・上限 ${RUN_CAP}）`);
  }
  if (repeatSkipped) console.log(`  常連(${REPEAT_MIN}回以上)向けの文面で返信: ${repeatSkipped}件`);
  console.log(`[auto-reply] 完了 / 今回返信=${posted}件 / ${JSON.stringify(summary)}`);
}
main().catch(e => { console.error('[auto-reply] 致命的エラー:', e); process.exit(1); });
