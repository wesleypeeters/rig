#!/usr/bin/env bash
set -euo pipefail

SSH_USER="${CLUSTER_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o BatchMode=yes"

if [ -n "${CLUSTER_HOST:-}" ]; then
  REMOTE_DIR="/tmp/rig-${GITHUB_RUN_ID:-$$}"
  rsync -az --delete -e "ssh $SSH_OPTS" . "${SSH_USER}@${CLUSTER_HOST}:${REMOTE_DIR}/"
  ssh $SSH_OPTS "${SSH_USER}@${CLUSTER_HOST}" "cd ${REMOTE_DIR} && CLUSTER=${CLUSTER} CI=true GITHUB_TOKEN=${GITHUB_TOKEN} GITHUB_REPOSITORY=${GITHUB_REPOSITORY} rig cleanup --max-age=${MAX_AGE:-48h}"
  ssh $SSH_OPTS "${SSH_USER}@${CLUSTER_HOST}" "rm -rf ${REMOTE_DIR}"
else
  rig cleanup --max-age="${MAX_AGE:-48h}"
fi
