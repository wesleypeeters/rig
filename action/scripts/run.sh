#!/usr/bin/env bash
set -euo pipefail

args=("$COMMAND")
case "$COMMAND" in
  build) ;;
  deploy|rm) [ "${AWAIT:-true}" = "true" ] && args+=(await) ;;
  cleanup) args+=("--max-age=${MAX_AGE:-48h}") ;;
  *) echo "Unsupported command: $COMMAND (expected build, deploy, rm or cleanup)" >&2; exit 1 ;;
esac

# Builds run on the runner. Everything else talks to the cluster: rig runs
# here, with the full GitHub environment, and every docker call (including
# the Caddy admin API, reached through docker exec) goes to the manager.
if [ "$COMMAND" != build ] && [ -n "${CLUSTER_HOST:-}" ]; then
  export DOCKER_HOST="ssh://$CLUSTER_HOST"
fi

rig "${args[@]}"
