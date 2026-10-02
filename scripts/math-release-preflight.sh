#!/usr/bin/env bash
# Back up Math's application schema and rehearse committed migrations in isolation.
set -euo pipefail
umask 077

cd "${DEPLOY_DIR:?}"
# Use the immutable image for this release, without starting the application.
API_IMAGE="$(docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/lightbulb031006/unicorns-api:latest)"
test -n "${API_IMAGE}"
BACKUP_DIR="$(mktemp -d /root/unicorns-math-predeploy-XXXXXXXX)"
CHECK_CONTAINER="math-migration-check-$(basename "${BACKUP_DIR}")"
CHECK_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() {
  docker rm -f "${CHECK_CONTAINER}" >/dev/null 2>&1 || true
  rm -f "${BACKUP_DIR}/pg.env"
}
trap cleanup EXIT

docker compose -p "${COMPOSE_PROJECT_NAME:?}" -f docker-compose.prod.yml \
  run --rm --no-deps -T --user root \
  -v "${BACKUP_DIR}:/preflight" --entrypoint node api \
  - prepare < "${REPO_ROOT}/scripts/math-release-preflight.cjs"
PG_MAJOR="$(cat "${BACKUP_DIR}/postgres-major")"
case "${PG_MAJOR}" in
  1[2-9]) ;;
  *) echo 'Unsupported PostgreSQL version; rollout stopped.' >&2; exit 1 ;;
esac
PG_IMAGE="postgres:${PG_MAJOR}-alpine"
docker pull "${PG_IMAGE}"
docker run --rm --env-file "${BACKUP_DIR}/pg.env" \
  -v "${BACKUP_DIR}:/backup" "${PG_IMAGE}" \
  pg_dump --format=custom --schema=public --no-owner --no-acl --file=/backup/public.dump
test -s "${BACKUP_DIR}/public.dump"
sha256sum "${BACKUP_DIR}/public.dump" > "${BACKUP_DIR}/public.dump.sha256"
echo "Application database backup saved: ${BACKUP_DIR}/public.dump"

# No ports, no external network and no production environment in the test database.
docker run -d --name "${CHECK_CONTAINER}" --network none --memory=256m \
  -e "POSTGRES_PASSWORD=${CHECK_PASSWORD}" -e POSTGRES_DB=math_release_check \
  -v "${BACKUP_DIR}:/backup:ro" "${PG_IMAGE}" \
  -c shared_buffers=32MB -c max_connections=20 >/dev/null
READY=false
for attempt in $(seq 1 30); do
  if docker exec "${CHECK_CONTAINER}" pg_isready -U postgres -d math_release_check >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 2
done
if [ "${READY}" != true ]; then echo 'Disposable database did not start.' >&2; exit 1; fi
docker exec "${CHECK_CONTAINER}" psql -U postgres -d math_release_check \
  -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; ALTER DATABASE math_release_check SET search_path = public, extensions;'
docker exec "${CHECK_CONTAINER}" pg_restore -U postgres -d math_release_check \
  --clean --if-exists --no-owner --no-acl --exit-on-error /backup/public.dump
CHECK_URL="postgresql://postgres:${CHECK_PASSWORD}@127.0.0.1:5432/math_release_check"
docker run --rm -i --network "container:${CHECK_CONTAINER}" \
  -e "DATABASE_URL=${CHECK_URL}" -e "DIRECT_URL=${CHECK_URL}" \
  --entrypoint node "${API_IMAGE}" - inspect \
  < "${REPO_ROOT}/scripts/math-release-preflight.cjs" > "${BACKUP_DIR}/before-rehearsal.json"
docker run --rm --network "container:${CHECK_CONTAINER}" --memory=512m \
  -e "DATABASE_URL=${CHECK_URL}" -e "DIRECT_URL=${CHECK_URL}" \
  -e NODE_OPTIONS=--max-old-space-size=384 --entrypoint sh "${API_IMAGE}" \
  -c './node_modules/.bin/prisma migrate deploy --schema=./prisma/schema/'
docker run --rm -i --network "container:${CHECK_CONTAINER}" \
  -e "DATABASE_URL=${CHECK_URL}" -e "DIRECT_URL=${CHECK_URL}" \
  --entrypoint node "${API_IMAGE}" - inspect \
  < "${REPO_ROOT}/scripts/math-release-preflight.cjs" > "${BACKUP_DIR}/after-rehearsal.json"
BEFORE_COUNTS="$(jq -Sc '.expectedCounts' "${BACKUP_DIR}/before-rehearsal.json")"
AFTER_COUNTS="$(jq -Sc '.counts' "${BACKUP_DIR}/after-rehearsal.json")"
if [ "${BEFORE_COUNTS}" != "${AFTER_COUNTS}" ]; then
  printf 'Before rehearsal: %s\nAfter rehearsal: %s\n' "${BEFORE_COUNTS}" "${AFTER_COUNTS}"
  echo 'Migration rehearsal changed core record counts or wallet totals; rollout stopped.' >&2
  exit 1
fi
test "$(jq -r '.pendingCount' "${BACKUP_DIR}/after-rehearsal.json")" = 0
echo 'Math migration rehearsal passed; only predicted account/profile additions, financial records and wallet balance preserved.'
