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

# SSH của GitHub Actions là bash không tương tác nên không đọc .bashrc,
# và vì vậy không nạp nvm. pnpm đang nằm trong bin của nvm, ngoài sudo secure_path.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  set +eu
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  set -eu
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if [[ -z "${PNPM_HOME:-}" && -f "$HOME/.bashrc" ]]; then
    PNPM_HOME="$(sed -n 's/^export PNPM_HOME="\(.*\)"/\1/p' "$HOME/.bashrc" | head -1)"
  fi
  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
  export PATH="$PNPM_HOME:$HOME/.local/bin:$PATH"
fi
hash -r

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa thấy node. Đã nạp nvm tại $NVM_DIR." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Không thấy pnpm sau khi nạp nvm ($NVM_DIR)." >&2
  echo "Chạy deploy bằng đúng user đã cài pnpm, không dùng sudo." >&2
  exit 1
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
