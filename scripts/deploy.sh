#!/usr/bin/env bash
# Chạy trên VPS. GitHub Actions gọi script này sau khi CI trên main thành công.
# Chạy tay: DEPLOY_SHA=<commit> bash scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Thiếu $ROOT/.env trên VPS. File này không được commit, giữ nguyên khi deploy." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js 22 trên VPS." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@9 --activate
  elif command -v npm >/dev/null 2>&1; then
    # Bản Node từ apt/Node 25+ không kèm corepack.
    npm install -g pnpm@9
  else
    echo "Chưa có pnpm. Trên VPS chạy một lần: npm install -g pnpm@9" >&2
    exit 1
  fi
  hash -r
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Chưa cài pm2. Một lần trên VPS: npm install -g pm2 && pm2 startup" >&2
  exit 1
fi

git fetch origin main

if [[ -n "${DEPLOY_SHA:-}" ]]; then
  git checkout --force --detach "$DEPLOY_SHA"
else
  git checkout main
  git reset --hard origin/main
fi

pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec tsc

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "Deploy API xong: $(git rev-parse --short HEAD)"
