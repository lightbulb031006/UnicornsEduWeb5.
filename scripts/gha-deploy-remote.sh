#!/usr/bin/env bash
# Remote commands for GitHub Actions deploy (VPS). Deploys every enabled instance.
set -euo pipefail

CANONICAL_REPO="${CANONICAL_REPO:-/root/UnicornsEduWeb5.}"
INSTANCES_FILE="${INSTANCES_FILE:-${CANONICAL_REPO}/deploy/instances.json}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-${CANONICAL_REPO}/scripts/gha-deploy-instance-remote.sh}"

if [ ! -d "${CANONICAL_REPO}/.git" ]; then
  echo "Missing git repo at ${CANONICAL_REPO}"
  exit 1
fi

cd "${CANONICAL_REPO}"
git fetch --prune origin main
git checkout main
git pull --ff-only origin main

if [ ! -f "${INSTANCES_FILE}" ]; then
  echo "Missing ${INSTANCES_FILE} after git pull."
  exit 1
fi

if [ ! -f "${DEPLOY_SCRIPT}" ]; then
  echo "Missing ${DEPLOY_SCRIPT} after git pull."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required on the VPS for multi-instance deploy (apt install jq)."
  exit 1
fi

INSTANCE_IDS="$(jq -r '.instances[] | select(.enabled == true) | .id' "${INSTANCES_FILE}")"
if [ -z "${INSTANCE_IDS}" ]; then
  echo "No enabled instances in ${INSTANCES_FILE}"
  exit 1
fi

for INSTANCE_ID in ${INSTANCE_IDS}; do
  export DEPLOY_INSTANCE="${INSTANCE_ID}"
  export REPO_ROOT="${CANONICAL_REPO}"
  export INSTANCES_FILE
  bash "${DEPLOY_SCRIPT}"
done

echo "All enabled instances deployed."
