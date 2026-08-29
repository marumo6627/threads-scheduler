# threads-scheduler

Threads の **自動投稿＋コメント自動返信** システム。
GitHub Actions（公開リポ＝Actions無料無制限）＋ cron-job.org（外部cron）＋ Threads Graph API で動く。

元の構築指示書: `~/Downloads/handoff/CLAUDE_CODE_SETUP_INSTRUCTIONS.md`

## 構成

```
[PC] ── 1日1回 ──> POSTS_JSON を GitHub Secret に更新（publish-day.mjs）
                          │
[cron-job.org] ─15分毎─> [GitHub Actions]
                          ├ post-scheduler … 各slot時刻の未投稿分を publish
                          ├ auto-reply     … 新着コメントに1回だけ返信
                          └ token-refresh  … 週次で長期トークンを延命
                          │
                    [Threads Graph API]
```

**起動を cron-job.org からの `workflow_dispatch` にしているのが設計の要。**
GitHub の `schedule` は無料枠だとドロップされ、日本の早朝枠が落ちる。`schedule` はバックアップ扱い。

## ディレクトリ

| パス | 中身 | 公開リポ |
|---|---|---|
| `scripts/*.mjs` | 汎用プラミング4本（本文・トークンを含まない） | ✅ push する |
| `.github/workflows/*.yml` | ワークフロー3本 | ✅ push する |
| `accounts/` | ペルソナ・共通ルール・型システム・learnings | ❌ gitignore |
| `.claude/agents/`, `.claude/commands/` | 生成用サブエージェント7体と `/today` `/review` | ❌ gitignore |
| `posts/` | 日次の投稿データ `YYYY-MM-DD.json` | ❌ gitignore |
| `metrics/` | `/review` に食わせる実績数値 | ❌ gitignore |
| `docs/` | 元バンドルの参照資料・サンプル | ❌ gitignore |

## 現在の状態

| 項目 | 状態 |
|---|---|
| `scripts/*.mjs` 4本 | ✅ 構文チェック済。post-scheduler はドライランで日付/時刻判定を確認済 |
| `.github/workflows/*.yml` 3本 | ✅ 配置済（GitHubリポ未作成のため未稼働） |
| `/today` `/review` | ✅ 実行可能。ただし `/today` の画像・スプレッドシート連携は【未接続】 |
| `accounts/0*.md` ペルソナ | ⚠️ learnings から復元した**下書き**。【要記入】の声・絵文字プール・ハンドルは運用者が埋める |
| `accounts/07_hana_pools.md` | ❌ 未作成（marketer が参照） |
| `.claude/agents/videographer.md` | ❌ 未同梱（鬼頭の動画フローは保留中なので当面不要） |
| GitHubリポ・Secrets・cron-job.org | ❌ 未設定（本人操作が必要） |
| `node` / `gh` | ✅ `~/.local` に導入済（node v24.20.0 LTS / gh 2.98.0）。`gh auth login` は未実行 |

### ツールチェーン

Homebrew は使わず、公式バイナリを `~/.local` に展開して `~/.local/bin` から symlink している（sudo不要）。

- `~/.local/node-v24.20.0/` → `node` / `npm` / `npx`
- `~/.local/gh-2.98.0/` → `gh`

`~/.local/bin` は `~/.zshrc` で PATH の先頭に入っている。更新したい時は同じ手順で新しい版を展開して symlink を張り替える。
Homebrew に移行する場合は `brew install node gh` の後、`~/.local/bin` の symlink を削除する。

## 日次運用

```sh
# 1. その日の投稿を生成（Claude Code 内で）
/today 2026-08-29          # → posts/2026-08-29.json

# 2. Secret に反映（当日＋翌日をまとめて渡せば前夜仕込み可）
node scripts/publish-day.mjs 2026-08-29 2026-08-30

# 3. あとは cron-job.org が15分ごとに起動する
```

数値がたまったら `/review` で `accounts/learnings/` を更新する。

## 動作確認

```sh
node scripts/post-scheduler.mjs --dry     # 投稿せず対象だけ表示
node scripts/auto-reply.mjs --dry         # 返信せず対象だけ表示
gh run list -R marumo6627/threads-scheduler --workflow=post-scheduler.yml   # 起動が来ているか
gh workflow run post-scheduler.yml -R marumo6627/threads-scheduler          # 手動起動
```

投稿が出ない時は、まず **起動が来ているか**（`workflow_dispatch` が15分間隔で並んでいるか）を疑う。
並んでいなければ cron-job.org 側（ジョブ有効・PAT期限・204が返るか）の問題。

## セキュリティ

- トークン・PAT はチャットに貼っても復唱・ログ出力しない。Secret か gitignore 済みファイルにだけ置く。
- 返信間隔（`auto-reply.mjs` の `DELAY_MS`）を詰めない。**アカBANが最大リスク**。
- 長期トークンは60日で失効する。`token-refresh` が動いていないと全アカ一斉停止する。
