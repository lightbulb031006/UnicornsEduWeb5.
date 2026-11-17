#!/usr/bin/env bash
# Supabase Studio local (Mac) cho DB self-host trên VPS, qua SSH tunnel Tailscale.
#
#   ./studio.sh up [it|eng|jp]   mở tunnel (nếu chưa có) + chạy Studio của instance
#   ./studio.sh down [id|all]    dừng Studio; không còn Studio nào thì đóng tunnel
#   ./studio.sh status
#
# Mật khẩu role `uniedu_<id>` đọc từ /root/uniedu-data/.env trên VPS mỗi lần `up`,
# chỉ truyền qua env cho docker compose — không ghi ra đĩa local.
set -euo pipefail

SSH_HOST="${STUDIO_SSH_HOST:-UnicornsEdu}"
TUNNEL_PORT="${STUDIO_TUNNEL_PORT:-64322}"
REMOTE_DB_PORT=54322
REMOTE_ENV=/root/uniedu-data/.env

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOCK="${TMPDIR:-/tmp}/uniedu-studio-tunnel.sock"

studio_port() {
  case "$1" in
    it) echo 64323 ;;
    eng) echo 64324 ;;
    jp) echo 64325 ;;
    *) echo "Instance không hợp lệ: $1 (it|eng|jp)" >&2; exit 1 ;;
  esac
}

compose() {
  local id="$1"; shift
  STUDIO_INSTANCE="$id" STUDIO_PORT="$(studio_port "$id")" TUNNEL_PORT="$TUNNEL_PORT" \
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-x}" PG_META_CRYPTO_KEY="${PG_META_CRYPTO_KEY:-x}" \
    docker compose -f "$DIR/docker-compose.yml" "$@"
}

tunnel_up() {
  if ssh -S "$SOCK" -O check "$SSH_HOST" 2>/dev/null; then
    return 0
  fi
  # Socket còn sót khi tunnel chết (Mac sleep, mất mạng) làm ssh -M bỏ multiplexing.
  rm -f "$SOCK"
  echo "Mở tunnel 127.0.0.1:${TUNNEL_PORT} → ${SSH_HOST}:127.0.0.1:${REMOTE_DB_PORT}..."
  ssh -f -N -M -S "$SOCK" \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L "127.0.0.1:${TUNNEL_PORT}:127.0.0.1:${REMOTE_DB_PORT}" "$SSH_HOST"
}

tunnel_down() {
  if ssh -S "$SOCK" -O check "$SSH_HOST" 2>/dev/null; then
    ssh -S "$SOCK" -O exit "$SSH_HOST" 2>/dev/null || true
    echo "Đã đóng tunnel."
  fi
}

running_instances() {
  local id
  for id in it eng jp; do
    if [ -n "$(compose "$id" ps -q 2>/dev/null)" ]; then
      echo "$id"
    fi
  done
}

cmd_up() {
  local id="${1:-it}"
  local port var
  port="$(studio_port "$id")"
  var="$(echo "$id" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"

  tunnel_up

  POSTGRES_PASSWORD="$(ssh "$SSH_HOST" "sed -n 's/^${var}=//p' ${REMOTE_ENV}" | tr -d '"'"'")"
  if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "Không đọc được ${var} từ ${SSH_HOST}:${REMOTE_ENV}" >&2
    exit 1
  fi
  PG_META_CRYPTO_KEY="$(openssl rand -hex 32)"
  export POSTGRES_PASSWORD PG_META_CRYPTO_KEY

  compose "$id" up -d --force-recreate
  echo "Studio uniedu_${id}: http://localhost:${port}"
}

cmd_down() {
  local target="${1:-all}" id
  if [ "$target" = "all" ]; then
    for id in it eng jp; do compose "$id" down 2>/dev/null || true; done
  else
    studio_port "$target" >/dev/null
    compose "$target" down
  fi
  if [ -z "$(running_instances)" ]; then
    tunnel_down
  fi
}

cmd_status() {
  if ssh -S "$SOCK" -O check "$SSH_HOST" 2>/dev/null; then
    echo "Tunnel: mở (127.0.0.1:${TUNNEL_PORT})"
  else
    echo "Tunnel: đóng"
  fi
  local id
  for id in $(running_instances); do
    echo "Studio ${id}: http://localhost:$(studio_port "$id")"
  done
}

case "${1:-}" in
  up) cmd_up "${2:-it}" ;;
  down) cmd_down "${2:-all}" ;;
  status) cmd_status ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
