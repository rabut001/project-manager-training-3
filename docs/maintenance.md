# 保守・公開の手順

すべての開発コマンドは開発コンテナ内で実行する。現在の仕様は `product.md`、作業ルールはルートの `AGENTS.md`。

## 改修

1. `specs/NNNN-short-name/README.md` を作り、目的・対象・手順・確認内容を書く。小さな変更は1枚でよい。
2. 動作を変える場合は `docs/product.md` を更新する。
3. 修正し、その変更に対応する検証を行い、実行結果を案件記録に残す。
4. プレビューで必要な表示を確認し、PRを作成する。GitHub Actionsの検証成功後、mainへ反映する。
5. 公開先でも確認して案件を完了する。完了後の記録は書き換えない。後日の修正は新しい案件で扱う。

## 問題・解説の訂正

`public/data/<回ID>/exam.json` が公開用テキストの正本。問番号と公式正解を勝手に変更しない。正解訂正が必要な場合はIPAの訂正情報と原本を確認し、根拠を案件記録に残す。

画面の問題文・選択肢は `qNN.png` の原本画像を表示する。JSONの `stem` / `choices` は照合の補助テキストで、要約や図表の文章化を含む。これらだけを編集しても問題画像は変わらない。問題の内容は原本画像を基準に確認する。

問題文・選択肢・解説を変更したら、その問を原本画像と照合し、計算は再計算する。法令・規格は出題当時の前提を確認する。作成とは別工程で再読レビューを行う。

初回のレビュー記録は `specs/0001-initial-release/review-*.csv`。初回案件完了後は過去のCSVを上書きせず、新規案件に同じ列の `review-*.csv` を作り、訂正した問だけの再確認記録を残す。検証スクリプトは案件番号順に読み、同じ問の新しい確認記録を優先する。画像を修正した場合も新規案件の `extraction-review.csv` に新しい画像ハッシュ・原本照合結果を記録する。

画像修正では `sources/ipa/<回ID>/header-overrides.json` や `crops.json` と原本を確認する。`extract_ipa.py` は既存の解説・校正文を保持する。作業用OCRやレビュー画像は `.cache/` に生成され、公開されない。

```sh
python scripts/extract_ipa.py 2025
python scripts/review_images.py
npm run validate:data
```

再抽出すると画像ハッシュが変わる場合がある。必ず原本と出力を照合し、新しい案件の確認記録を追加する。ハッシュ確認を無効化しない。

## 年度の追加

IPAが公開した問題と正解だけを対象とする。`scripts/fetch_ipa.py` の対応範囲、原本台帳、画像・JSONを追加し `npm run sync:index` で一覧を更新する。`validate-data.mjs` の初回範囲17回425問という検証条件も、承認済みの新しい範囲に合わせる。アプリの年度一覧へIDを直書きする必要はない。

## 学習履歴

キーは `pm-am2:v1:<回ID>`。データ形式を変更するときは既存形式を読み込む移行を実装し、未確認の選択・確認済み回答・現在問・チェックを維持する。問IDを変えない。保存不能時は通知を出し、そのセッションでは演習を継続できる。

## GitHub Pages

`.github/workflows/pages.yml` はPR・mainのpush・手動実行で検証する。リポジトリ変数 `PAGES_ENABLED` が `true` の場合だけ、mainの検証成功後に公開する。CIも `.devcontainer/Dockerfile` の環境内でnpmとテストを実行する。公開対象は `dist/` のみ。ビルドの `BASE_PATH` はリポジトリ名から設定する。

初回はGitHub CLIで認証後、`project-manager-training-3` を非公開で作成し、ソースをpushして検証する。公開の承認後にリポジトリを公開へ変更し、GitHubの Settings → Pages → Source を GitHub Actions に設定する。Settings → Secrets and variables → Actions → Variables で `PAGES_ENABLED=true` を設定してワークフローを手動実行する。トークンや認証設定をリポジトリへ保存しない。

公開前の確認:

```sh
npm run check
npm run test:e2e
BASE_PATH=/project-manager-training-3/ npm run build
BASE_PATH=/project-manager-training-3/ npm run test:production
```

公開後は一覧、年度の直接URLと再読み込み、問題画像、回答、解説を確認する。検証が失敗した状態では公開しない。

## 公開を戻す

不具合の変更を `git revert` で取り消してmainへ反映する。強制pushはしない。既知の正常なコード・データに戻した変更も、通常の検証・公開ワークフローを通す。ブラウザ内の学習履歴は公開操作では削除しない。履歴形式を変更したリリースを戻す場合は、旧コードが履歴を読めるか先に確認する。
