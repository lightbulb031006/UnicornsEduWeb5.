#!/usr/bin/env bash
# Đẩy bản backup mới nhất (một timestamp) lên Cloudflare R2 bằng wrangler.
# Usage: ./offsite-r2.sh <TS>     (backup.sh tự gọi nếu có r2.env)
# r2.env (chmod 600): CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, R2_BUCKET (mặc định uni-manage)
# Key: uniedu-data/db/<TS>/uniedu_<id>.dump, uniedu-data/storage/<TS>/storage-<id>.tar.gz[.partNN]
# Retention phía R2 do lifecycle rule của bucket (xem docs/ops/vps-local-supabase.md).
set -euo pipefail
umask 077

cd "$(dirname "$0")"
TS="${1:?usage: offsite-r2.sh <TS>}"
WRANGLER_VERSION=4.153.0
NODE_IMAGE=node:22-bookworm-slim
# wrangler r2 object put giới hạn 315 MB/object → cắt file lớn hơn PART_SIZE.
PART_SIZE=$((300 * 1024 * 1024))

set -a
# shellcheck disable=SC1091
. ./r2.env
set +a
BUCKET="${R2_BUCKET:-uni-manage}"

if [ ! -x .wrangler-cli/node_modules/.bin/wrangler ]; then
  docker run --rm -v "$PWD/.wrangler-cli:/w" "$NODE_IMAGE" \
    npm install --prefix /w --no-fund --no-audit "wrangler@${WRANGLER_VERSION}" >/dev/null
fi

wrangler() {
  docker run --rm \
    -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID -e WRANGLER_SEND_METRICS=false \
    -v "$PWD/.wrangler-cli:/w:ro" -v "$PWD/backups/daily:/b:ro" -v "$PWD/backups/split:/s:ro" \
    "$NODE_IMAGE" /w/node_modules/.bin/wrangler "$@"
}

put() { # put <đường dẫn trong container> <key>
  wrangler r2 object put "${BUCKET}/$2" --file "$1" --remote --content-type application/octet-stream >/dev/null
  echo "  → r2://${BUCKET}/$2"
}

rm -rf backups/split && mkdir -p backups/split
for f in backups/daily/*-"${TS}".*; do
  name="$(basename "$f")"
  id_name="${name/-${TS}/}" # uniedu_it.dump | storage-it.tar.gz
  case "$name" in uniedu_*) dir=db ;; *) dir=storage ;; esac
  key="uniedu-data/${dir}/${TS}/${id_name}"
  if [ "$(stat -c %s "$f")" -le "$PART_SIZE" ]; then
    put "/b/${name}" "$key"
  else
    split -b "$PART_SIZE" -d -a 2 "$f" "backups/split/${id_name}.part"
    for p in backups/split/"${id_name}".part*; do
      put "/s/$(basename "$p")" "${key}.${p##*.}"
    done
  fi
done
rm -rf backups/split
echo "[${TS}] offsite R2 OK (${BUCKET})"
