#!/usr/bin/env bash
set -euo pipefail
if [[ -f package-lock.json ]]; then
  npm ci
  npx playwright install --with-deps chromium
else
  echo 'package-lock.json 未作成のため、初期セットアップ後に npm ci を実行してください。'
fi
