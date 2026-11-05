#!/usr/bin/env bash
# Sinh .env cho data stack: mật khẩu Postgres, JWT secret + anon/service key (HS256)
# cho từng storage. Không ghi đè .env đã có.
#   ./gen-env.sh https://it.uniedu.vn https://eng.uniedu.vn https://jp.uniedu.vn
set -euo pipefail

cd "$(dirname "$0")"
if [ -e .env ]; then
  echo ".env đã tồn tại — không ghi đè." >&2
  exit 1
fi
if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <it-public-url> <eng-public-url> <jp-public-url>" >&2
  exit 1
fi

rand_hex() { openssl rand -hex "$1"; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# JWT HS256 { role, iss, iat, exp } — cùng dạng anon/service_role key của Supabase.
sign_jwt() {
  local secret="$1" role="$2" now exp header payload sig
  now="$(date +%s)"
  exp="$((now + 10 * 365 * 24 * 3600))"
  header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$exp" | b64url)"
  sig="$(printf '%s.%s' "$header" "$payload" | openssl dgst -binary -sha256 -hmac "$secret" | b64url)"
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

umask 077
{
  echo "POSTGRES_PASSWORD=$(rand_hex 24)"
  i=1
  for id in IT ENG JP; do
    secret="$(rand_hex 32)"
    echo
    echo "${id}_PUBLIC_URL=${!i}"
    echo "${id}_DB_PASSWORD=$(rand_hex 24)"
    echo "${id}_STORAGE_JWT_SECRET=${secret}"
    echo "${id}_STORAGE_ANON_KEY=$(sign_jwt "$secret" anon)"
    echo "${id}_STORAGE_SERVICE_KEY=$(sign_jwt "$secret" service_role)"
    i=$((i + 1))
  done
} > .env

echo "Đã tạo $(pwd)/.env (chmod 600)."
