// Threads 長期トークンの自動更新。THREADS_TOKENS を読み、各トークンを refresh_access_token で
// 更新(有効期限を60日リセット)して、更新後の配列を標準出力に出す。
// refresh は「発行から24時間以上・未失効」のトークンにのみ効く。効かない時は既存を維持。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const A = 'https://graph.threads.net';
const HERE = dirname(fileURLToPath(import.meta.url));
const toks = JSON.parse(process.env.THREADS_TOKENS || readFileSync(join(HERE, 'tokens.env'), 'utf8'));
const out = []; let refreshed = 0, kept = 0;
for (const t of toks) {
  if (!t || !t.access_token) { out.push(t); kept++; continue; }
  try {
    const r = await fetch(`${A}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t.access_token)}`).then(x => x.json());
    if (r && r.access_token) { out.push({ ...t, access_token: r.access_token }); refreshed++; process.stderr.write(`✅ refreshed ${t.account}\n`); }
    else { out.push(t); kept++; process.stderr.write(`➖ kept ${t.account}: ${JSON.stringify(r).slice(0,140)}\n`); }
  } catch (e) { out.push(t); kept++; process.stderr.write(`➖ kept ${t.account} (err)\n`); }
}
process.stderr.write(`[refresh-tokens] 更新${refreshed} / 維持${kept}\n`);
process.stdout.write(JSON.stringify(out, null, 2));
