#!/usr/bin/env bash
set -euo pipefail

SSH_USER="${CLUSTER_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o BatchMode=yes"
CMD="rig rm"
[ "${AWAIT:-true}" = "true" ] && CMD="rig rm await"

if [ -n "${CLUSTER_HOST:-}" ]; then
  REMOTE_DIR="/tmp/rig-${GITHUB_RUN_ID:-$$}"
  rsync -az --delete -e "ssh $SSH_OPTS" . "${SSH_USER}@${CLUSTER_HOST}:${REMOTE_DIR}/"
  ssh $SSH_OPTS "${SSH_USER}@${CLUSTER_HOST}" "cd ${REMOTE_DIR} && CLUSTER=${CLUSTER} CI=true ${CMD}"
  ssh $SSH_OPTS "${SSH_USER}@${CLUSTER_HOST}" "rm -rf ${REMOTE_DIR}"
else
  $CMD
fi
