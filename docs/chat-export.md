# チャットのMarkdown出力

参照元の[チャット出力手順](https://github.com/rabut001/system-arch-training/blob/main/.cursor/skills/export-chat/SKILL.md)と同様に、会話本文を `chat-exports/YYYY-MM-DD-HHMM/chat.md` に保存する。Codexでは `scripts/export_chat.py` を使う。Python標準ライブラリだけで動作する。

## 使い方

Codexへ「このチャットをMarkdownで出力してください」と依頼できる。現在の会話のJSONLを変換し、生成したファイルへのリンクを返す。今回の回答など、書き出し実行後の発言を含めたい場合は再度書き出す。

手動の場合、対象のCodexセッションIDと一致する `rollout-...-<セッションID>.jsonl` を指定する。保存先の例はCodexの設定ディレクトリ内の `sessions/YYYY/MM/DD/`。これは実ログで確認したローカル形式であり、Codexのバージョンによって変わる可能性がある。ファイルの更新日時だけで選ぶと別の会話やサブエージェントを取り込むことがあるため、IDで選ぶ。

JSONLをコンテナ内から参照できる場合は、開発コンテナ内で実行する。

```sh
npm run export:chat -- --transcript /path/to/rollout-session.jsonl
```

ホスト上のファイルを渡す場合は、ホストのシェルで以下を実行する。Pythonはコンテナ内で動作し、入力ファイルをコピーせずに読む。コンテナ名とホスト側パスは自分の環境に合わせる。

```sh
docker exec -i -w /workspace pm-training-3-dev \
  python3 scripts/export_chat.py --transcript - \
  < /path/on/host/rollout-session.jsonl
```

実行が成功すると出力ファイルのパスを表示する。フォルダ名と発言日時は日本時間。開始時刻にはJSONLの `session_meta` を使う。`--timezone UTC` などで変更でき、`--repo-root /path/to/output` で保存先も変更できる。同じ会話の再実行は上書きし、同じ分に開始した別の会話がある場合はエラーにするので、別の保存先を指定する。

## 出力する内容

- ユーザー本文とアシスタントの進捗・最終回答を元の順序で保存する。Markdownの改行とコードブロックを保持する。
- 選択式の質問への回答は「質問」「回答」に整える。画像添付は `[画像添付]` と表示し、画像データ自体は書き出さない。
- ツール呼び出し・結果、推論、システム・開発者指示、圧縮時の要約、環境やブラウザの自動付加情報は含めない。メッセージと重複するイベントも含めない。
- 対応入力は `session_meta` と `response_item` のメッセージが入ったCodexのrollout JSONL。Cursorのログや `codex exec --json` のイベント出力は対象外。壊れたJSONは行番号を示して停止し、既存ファイルを保持する。

`chat-exports/` は `.gitignore` に登録している。ログそのものは明示依頼がなければコミットしない。サイトの公開対象は `dist/` なので、会話ファイルはGitHub Pagesにも含まれない。スクリプトは本文内の個人情報や秘密情報を自動でマスキングしないため、共有する場合は出力内容を確認する。

## 検証

開発コンテナ内で実行する。GitHub Actionsでも同じ検証を行う。

```sh
python3 -m unittest discover -s tests/tools -p 'test_*.py'
```
