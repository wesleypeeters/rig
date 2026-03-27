#!/usr/bin/env bash
set -euo pipefail

# Install Deno if not available.
if ! command -v deno &>/dev/null; then
  curl -fsSL https://deno.land/install.sh | sh
  echo "$HOME/.deno/bin" >> "$GITHUB_PATH"
  export PATH="$HOME/.deno/bin:$PATH"
fi

# Install rig CLI.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deno install -n rig -gfAc "$SCRIPT_DIR/../deno.json" "$SCRIPT_DIR/../src/main.ts"

# Setup SSH for remote cluster access.
if [ -n "${CLUSTER_SSH_KEY:-}" ]; then
  mkdir -p ~/.ssh
  echo "$CLUSTER_SSH_KEY" > ~/.ssh/id_ed25519
  chmod 600 ~/.ssh/id_ed25519
  ssh-keyscan -H "${CLUSTER_HOST}" >> ~/.ssh/known_hosts 2>/dev/null
fi

# Login to GHCR.
if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
fi
