#!/usr/bin/env bash
set -euo pipefail

# Install Deno if not available.
if ! command -v deno &>/dev/null; then
  curl -fsSL https://deno.land/install.sh | sh
  echo "$HOME/.deno/bin" >> "$GITHUB_PATH"
  export PATH="$HOME/.deno/bin:$PATH"
fi

# Install the rig CLI from this checkout of the action.
RIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deno install -n rig -gfAc "$RIG_DIR/deno.json" "$RIG_DIR/src/main.ts"

# SSH to the swarm manager, used as DOCKER_HOST=ssh://... by run.sh.
if [ -n "${CLUSTER_HOST:-}" ]; then
  : "${CLUSTER_SSH_KEY:?CLUSTER_SSH_KEY must be set when CLUSTER_HOST is}"
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  (umask 077 && printf '%s\n' "$CLUSTER_SSH_KEY" > ~/.ssh/rig_cluster)
  # Pin the host key when given; otherwise trust what the host presents now.
  if [ -n "${CLUSTER_KNOWN_HOSTS:-}" ]; then
    printf '%s\n' "$CLUSTER_KNOWN_HOSTS" >> ~/.ssh/known_hosts
  else
    ssh-keyscan -H "$CLUSTER_HOST" >> ~/.ssh/known_hosts 2>/dev/null
  fi
  # One multiplexed connection for the many docker calls a deploy makes.
  cat >> ~/.ssh/config <<CONFIG
Host $CLUSTER_HOST
  User ${CLUSTER_SSH_USER:-root}
  IdentityFile ~/.ssh/rig_cluster
  BatchMode yes
  ControlMaster auto
  ControlPath ~/.ssh/rig-%C
  ControlPersist 120
CONFIG
fi

# Log in to GHCR: build pushes with it, and deploy forwards it to the swarm
# nodes (--with-registry-auth) so they can pull private images.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
fi
