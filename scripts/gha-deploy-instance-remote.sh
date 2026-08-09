#!/usr/bin/env bash
# Deploy one VPS instance (see deploy/instances.json).
# Called by gha-deploy-all-remote.sh or directly with DEPLOY_INSTANCE=<id>.
set -euo pipefail

INSTANCE_ID="${DEPLOY_INSTANCE:-math}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INSTANCES_FILE="${INSTANCES_FILE:-${REPO_ROOT}/deploy/instances.json}"

if [ ! -f "${INSTANCES_FILE}" ]; then
  echo "Missing instance registry: ${INSTANCES_FILE}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required on the VPS to read ${INSTANCES_FILE}"
  exit 1
fi

INSTANCE_JSON="$(jq -c --arg id "${INSTANCE_ID}" '
  .instances[]
  | select(.id == $id)
' "${INSTANCES_FILE}")"

if [ -z "${INSTANCE_JSON}" ]; then
  echo "Unknown DEPLOY_INSTANCE=${INSTANCE_ID}. Check deploy/instances.json"
  exit 1
fi

INSTANCE_ENABLED="$(echo "${INSTANCE_JSON}" | jq -r '.enabled')"
if [ "${INSTANCE_ENABLED}" != "true" ]; then
  echo "Instance ${INSTANCE_ID} is disabled in deploy/instances.json — skip."
  exit 0
fi

DEPLOY_DIR="$(echo "${INSTANCE_JSON}" | jq -r '.deploy_dir')"
export COMPOSE_PROJECT_NAME="$(echo "${INSTANCE_JSON}" | jq -r '.compose_project')"
export NGINX_PUBLISH="$(echo "${INSTANCE_JSON}" | jq -r '.nginx_publish')"
INSTANCE_LABEL="$(echo "${INSTANCE_JSON}" | jq -r '.label')"

NGINX_LOOPBACK_PORT="${NGINX_LOOPBACK_PORT:-}"
if [ -z "${NGINX_LOOPBACK_PORT}" ]; then
  # NGINX_PUBLISH format: 127.0.0.1:8080:80 → loopback port 8080
  NGINX_LOOPBACK_PORT="$(echo "${NGINX_PUBLISH}" | awk -F: '{print $(NF-1)}')"
fi

echo "========== Deploy instance: ${INSTANCE_ID} (${INSTANCE_LABEL}) =========="
echo "  dir=${DEPLOY_DIR}"
echo "  project=${COMPOSE_PROJECT_NAME}"
echo "  nginx=${NGINX_PUBLISH}"

if [ ! -d "${DEPLOY_DIR}" ]; then
  echo "Deploy directory does not exist: ${DEPLOY_DIR}"
  echo "Bootstrap this instance first — see docs/ops/vps-single-instance-runbook.md"
  exit 1
fi

cd "${DEPLOY_DIR}"

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
  export COMPOSE_PROJECT_NAME NGINX_PUBLISH
  docker compose -f docker-compose.prod.yml -p "${COMPOSE_PROJECT_NAME}" "$@"
}

# Compose project mặc định cũ (khi chạy `docker compose up` không kèm -p) tạo ra
# stack "unicorns" song song với stack thật "unicornseduweb5" → phải dọn trước khi deploy.
LEGACY_IT_COMPOSE_PROJECTS=(unicorns unicornsedu unicorns-it)

stop_legacy_compose_project() {
  local legacy_project="$1"
  if [ -z "${legacy_project}" ] || [ "${legacy_project}" = "${COMPOSE_PROJECT_NAME}" ]; then
    return 0
  fi
  echo "Attempting legacy compose down: ${legacy_project}..."
  docker compose -p "${legacy_project}" -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
}

stop_docker_containers_on_port() {
  local port="$1"
  local cid name

  while IFS= read -r cid; do
    [ -z "${cid}" ] && continue
    name="$(docker inspect -f '{{.Name}}' "${cid}" 2>/dev/null || echo "${cid}")"
    echo "Stopping container holding host port ${port}: ${name}"
    docker stop "${cid}" || true
    docker rm "${cid}" || true
  done < <(docker ps -q --filter "publish=${port}" 2>/dev/null || true)
}

migrate_it_from_legacy_compose() {
  if [ "${INSTANCE_ID}" != "math" ]; then
    return 0
  fi
  local legacy
  for legacy in "${LEGACY_IT_COMPOSE_PROJECTS[@]}"; do
    stop_legacy_compose_project "${legacy}"
  done
  stop_docker_containers_on_port 80
}

prepare_nginx_host_port() {
  echo "Preparing host port ${NGINX_LOOPBACK_PORT} for nginx (${COMPOSE_PROJECT_NAME})..."
  if [ "${INSTANCE_ID}" = "math" ]; then
    local legacy
    for legacy in "${LEGACY_IT_COMPOSE_PROJECTS[@]}"; do
      stop_legacy_compose_project "${legacy}"
    done
  fi
  stop_docker_containers_on_port "${NGINX_LOOPBACK_PORT}"
  compose rm -sf nginx 2>/dev/null || true
}

migrate_it_from_legacy_compose

docker_disk_report() {
  echo "Docker disk usage:"
  docker system df || true
  df -h / /var/lib/docker /var/lib/containerd 2>/dev/null || df -h /
}

docker_prune_unused() {
  echo "Pruning stopped containers, dangling images and build cache..."
  docker container prune -f || true
  docker image prune -f || true
  docker builder prune -f || true
  docker_disk_report
}

docker_prune_unused

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

compose_pull_service_with_retry api

echo "Applying database migrations..."
compose run --rm --no-deps -T api \
  env NODE_OPTIONS=--max-old-space-size=384 \
  sh -c 'if [ -n "${DIRECT_URL:-}" ]; then export DATABASE_URL="$DIRECT_URL"; elif printf "%s" "$DATABASE_URL" | grep -q "pgbouncer=true"; then echo "DIRECT_URL is required when DATABASE_URL uses PgBouncer (pgbouncer=true)" >&2; exit 1; fi; ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema/' </dev/null

echo "Verifying Prisma client generation..."
compose run --rm --no-deps -T api \
  ./node_modules/.bin/prisma generate --schema=./prisma/schema/ </dev/null

compose up -d --no-deps --force-recreate api
wait_for_http api http://127.0.0.1:4000/
docker_prune_unused

compose_pull_service_with_retry web
compose up -d --no-deps --force-recreate web
wait_for_http web http://127.0.0.1:3000/api/healthcheck
docker_prune_unused

compose_pull_service_with_retry nginx
prepare_nginx_host_port
compose up -d --no-deps --force-recreate --remove-orphans nginx
wait_for_container_running nginx

compose exec -T nginx nginx -t </dev/null
compose exec -T nginx nginx -s reload </dev/null

wait_for_http nginx http://127.0.0.1/nginx-health
wait_for_http nginx http://127.0.0.1/api/
echo "Local nginx OK for cloudflared tunnel: http://127.0.0.1:${NGINX_LOOPBACK_PORT}"

docker_prune_unused
echo "========== Instance ${INSTANCE_ID} deploy complete =========="
