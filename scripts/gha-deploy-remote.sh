#!/usr/bin/env bash
# Remote commands for GitHub Actions deploy (VPS). Sourced via stdin by ssh / appleboy.
set -euo pipefail
DEPLOY_DIR="${DEPLOY_DIR:-/opt/unicorns-edu}"
cd "$DEPLOY_DIR"

git fetch --prune origin main
git checkout main
git pull --ff-only origin main

if [ -z "${GHCR_TOKEN:-}" ]; then
  echo "Missing GHCR_TOKEN: VPS cannot pull private images from ghcr.io. Add repo secret GHCR_TOKEN (PAT with read:packages)."
  exit 1
fi
if [ -z "${GHCR_USERNAME:-}" ]; then
  echo "Missing GHCR_USERNAME: set repo secret or variable GHCR_USERNAME (GitHub username that owns the PAT)."
  exit 1
fi

printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

compose() {
  docker compose -f docker-compose.prod.yml "$@"
}

docker_disk_report() {
  echo "Docker disk usage:"
  docker system df || true
  df -h / /var/lib/docker /var/lib/containerd 2>/dev/null || df -h /
}

# Reclaim disk WITHOUT the `-a` flag.
# `docker system prune -a` removes every image not attached to a container,
# including a freshly pulled `:latest` that is waiting to be deployed.
# Plain prune still frees the previous images: once `:latest` is retagged to a
# new digest the old image becomes dangling and is collected here.
docker_prune_unused() {
  echo "Pruning stopped containers, dangling images and build cache..."
  docker container prune -f || true
  docker image prune -f || true
  docker builder prune -f || true
  docker_disk_report
}

docker_prune_unused

# Pull one service at a time to keep disk peak low on small VPS disks.
compose_pull_service_with_retry() {
  local service="$1"
  local max="${COMPOSE_PULL_RETRIES:-5}"
  local attempt=1
  while [ "$attempt" -le "$max" ]; do
    if compose pull "$service"; then
      return 0
    fi
    if [ "$attempt" -eq "$max" ]; then
      echo "docker compose pull ${service} failed after ${max} attempt(s)."
      docker_disk_report
      return 1
    fi
    local wait=$((attempt * 15))
    echo "docker compose pull ${service} failed (attempt ${attempt}/${max}), pruning and retrying in ${wait}s..."
    docker_prune_unused
    sleep "$wait"
    attempt=$((attempt + 1))
  done
}

# Disk-pressured VPS boots slowly; keep generous waits (override via env if needed).
wait_for_http() {
  service="$1"
  url="$2"
  max="${WAIT_HTTP_RETRIES:-90}"

  for attempt in $(seq 1 "$max"); do
    if compose exec -T "$service" sh -c '
      http_url="$1"
      if command -v node >/dev/null 2>&1; then
        node -e "fetch(process.argv[1]).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))" "$http_url"
      elif command -v wget >/dev/null 2>&1; then
        wget -q -O /dev/null "$http_url"
      elif command -v curl >/dev/null 2>&1; then
        curl -fsS "$http_url" >/dev/null
      else
        echo "No HTTP client available in container for healthcheck" >&2
        exit 127
      fi
    ' sh "$url" </dev/null; then
      echo "Service $service is ready at $url"
      return 0
    fi

    sleep 5
  done

  echo "Timed out waiting for service: $service ($url)"
  compose ps
  compose logs --tail=100 "$service"
  container_id="$(compose ps -q "$service")"
  if [ -n "$container_id" ]; then
    docker inspect --format '{{json .State.Health}}' "$container_id" || true
  fi
  exit 1
}

wait_for_container_running() {
  service="$1"
  max="${WAIT_CONTAINER_RETRIES:-60}"

  for attempt in $(seq 1 "$max"); do
    container_id="$(compose ps -q "$service")"
    if [ -n "$container_id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || echo false)" = "true" ]; then
      echo "Container $service is running"
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for container: $service"
  compose ps
  compose logs --tail=100 "$service"
  exit 1
}

# --- API: pull the new image, validate Prisma generation, then recreate ------
compose_pull_service_with_retry api

echo "Verifying Prisma client generation..."
# CD intentionally does not apply database migrations. Run the committed
# migration procedure separately for releases that require schema changes.
# `</dev/null`: this script is fed to `bash -s` over ssh stdin; `docker compose run`
# attaches stdin and would otherwise consume the rest of the script, ending the
# deploy right after the Prisma check (api/web/nginx never get recreated).
compose run --rm --no-deps -T api \
  ./node_modules/.bin/prisma generate --schema=./prisma/schema/ </dev/null

compose up -d --no-deps --force-recreate api
wait_for_http api http://127.0.0.1:4000/
docker_prune_unused

# --- WEB --------------------------------------------------------------------
compose_pull_service_with_retry web
compose up -d --no-deps --force-recreate web
wait_for_http web http://127.0.0.1:3000/api/healthcheck
docker_prune_unused

# --- NGINX: --no-deps so the already-running api/web are not recreated again
compose_pull_service_with_retry nginx
compose up -d --no-deps --force-recreate --remove-orphans nginx
wait_for_container_running nginx

compose exec -T nginx nginx -t </dev/null
compose exec -T nginx nginx -s reload </dev/null

wait_for_http nginx http://127.0.0.1/nginx-health
wait_for_http nginx http://127.0.0.1/api/
echo "Local nginx OK for cloudflared tunnel: http://127.0.0.1:80"

docker_prune_unused
