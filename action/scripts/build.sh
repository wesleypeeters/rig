#!/usr/bin/env bash
set -euo pipefail

export PUSH="${PUSH:-false}"
rig build
