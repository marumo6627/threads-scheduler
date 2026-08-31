# 投稿画像

ここに置いた jpg/png は **公開リポジトリに push され**、
`https://raw.githubusercontent.com/marumo6627/threads-scheduler/main/assets/...` で配信される。
Threads API はこの URL を読んで画像投稿する。Google Drive も rclone も不要。

## 使い方

1. 画像をこのフォルダに置く
2. `node scripts/publish-images.mjs` … push して raw URL の到達を確認
3. `posts/YYYY-MM-DD.json` の該当投稿に `"image": "assets/ファイル名.jpg"` を足す
4. `node scripts/publish-day.mjs YYYY-MM-DD` で反映

## 制約

- **jpg / png のみ**。8MB 以下
- **ここに置いた画像は公開される**（投稿に使う画像なので問題ないはずだが、意図しないものを置かないこと）
- 画像なしの投稿は `image` を省略すればテキスト投稿のまま
