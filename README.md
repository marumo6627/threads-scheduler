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
| `assets/` | 投稿画像（raw URL で Threads に配信） | ✅ push する |

## 現在の状態

| 項目 | 状態 |
|---|---|
| `scripts/*.mjs` 4本 | ✅ 構文チェック済。post-scheduler はドライランで日付/時刻判定を確認済 |
| `.github/workflows/*.yml` 3本 | ✅ 配置済（GitHubリポ未作成のため未稼働） |
| `/today` `/review` | ✅ 実行可能 |
| 画像投稿 | ✅ `assets/` → raw URL → `media_type: IMAGE`。Threads側の取得を検証済み |
| `accounts/moon_kyundaily.md` | ✅ 実データ（50投稿＋インサイト）から構築 |
| Secrets 4つ・cron-job.org | ✅ 設定済み・実投稿と実返信で検証済み |
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

# 2. Secret に反映（★渡した日付で POSTS_JSON を「上書き」する。追加ではない）
node scripts/publish-day.mjs 2026-08-29 2026-08-30

# 3. あとは cron-job.org が15分ごとに起動する
```

> ⚠️ **`publish-day.mjs` は上書き。** 当日分がまだ未投稿のまま翌日分だけを渡すと、当日分が消える。
> 当日分が残っているときは必ず両方の日付を渡すこと。

画像を付ける場合は、`assets/` に置いてから:

```sh
node scripts/publish-images.mjs      # push して raw URL の到達を確認
# posts/YYYY-MM-DD.json に "image": "assets/xxx.jpg" を足す
node scripts/publish-day.mjs YYYY-MM-DD
```

```sh
# 投稿済みか未投稿かを確認（★本文を修正する前に必ず実行）
node scripts/check-posted.mjs [YYYY-MM-DD]

# 実績を取得して metrics/ に保存（/review の入力）
node scripts/fetch-metrics.mjs
```

> ⚠️ **公開済みの投稿は `posts/*.json` を書き換えても直らない。**
> 本文が変わると重複判定をすり抜け、**同じ内容が二重投稿される**（2026-09-05 に発生）。

数値がたまったら `/review` で `accounts/learnings/` を更新する。
投稿枠と検証中の実験は `accounts/learnings/_experiments.md` を参照。

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
