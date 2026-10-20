# プロジェクトマネージャ 午前Ⅱ 過去問演習

[アプリを開く](https://rabut001.github.io/project-manager-training-3/)

IPA公開のPM午前Ⅱを年度別に1問ずつ解く静的Webアプリです。2009〜2025年度の17回425問を扱います。2016年度問2は公式出題不備のため、画像と説明を残して採点対象外とします（採点対象424問）。2026年度の科目A-2に相当する過去問です。

年度選択、ア〜エの解答、個別・一括採点、解説、チェック、画像拡大に対応。進捗は同じブラウザのlocalStorageに保存されます。ログインや端末間同期はありません。問題は原本から切り出した画像で表示します。画像内の文字は選択・読み上げできないため、本文のアクセシビリティには制約があります。

## このリポジトリについて

このリポジトリは、Claude CodeとOpenAI Codexに同じ指示を与え、作成されたアプリやリポジトリの内容を比較するために作成しました。このリポジトリの成果物は、OpenAI Codexの **GPT-6 Astra、highモード** で作成したものです。

## 開発

DockerとVS CodeのDev Containers拡張を使用し、このフォルダを **Reopen in Container** で開きます。Node.js 24、npm、Python、PyMuPDF、Tesseract（日本語）、GitHub CLIは開発コンテナに含まれます。ホストへNode.js等をインストールする必要はありません。初期化時にnpm依存とChromiumを導入します。

以下のコマンドはすべて開発コンテナ内で実行します。

```sh
npm run dev
npm run check
npm run test:e2e
BASE_PATH=/project-manager-training-3/ npm run build
BASE_PATH=/project-manager-training-3/ npm run test:production
```

通常の開発URLは `http://localhost:5173/`。ハッシュURLなので年度画面を直接開いても再読み込みできます。Dockerでホストの5183番へ割り当てた場合は `http://localhost:5183/` です。

## 構成

| パス | 役割 |
| --- | --- |
| `src/` | React/TypeScriptの画面・採点・保存 |
| `public/data/` | 公開する年度索引・問題JSON・画像 |
| `sources/ipa/` | 原本PDF、URL/取得日/ハッシュ台帳、切り出し位置 |
| `scripts/` | 原本取得・抽出・確認用画像・完成データ検証 |
| `tests/` | PC/携帯の操作テストと公開ビルドの実データテスト |
| `docs/product.md` | 現在の製品仕様 |
| `docs/maintenance.md` | 教材修正・問題追加・公開と復旧の手順 |
| `specs/` | 案件ごとの決定・作業・検証記録。完了後は変更しない |
| `.devcontainer/` | 開発・CIで使う環境 |

解説は事前作成したものをJSONに保存し、利用時には生成しません。原本PDFや改修記録はサイトの公開成果物に含めません。

## 出典

問題と公式正解の出典は[IPAの過去問題](https://www.ipa.go.jp/shiken/mondai-kaiotu/)です。各問題に年度・試験区分・時間区分・問番号と原本PDFへのリンクを表示します。元のURLとSHA-256は `sources/ipa/manifest.json` にあります。

IPAは試験問題の著作権を放棄していません。利用条件は[試験に関するFAQ](https://www.ipa.go.jp/shiken/faq.html)を参照してください。問題は内容を変更せず、1問ごとの切り出し・余白調整を行っています。解説は独自に作成した非公式の学習用説明です。

UIと設計の参考: [rabut001/system-arch-training](https://github.com/rabut001/system-arch-training)（調査時 `380b7d8`）。
