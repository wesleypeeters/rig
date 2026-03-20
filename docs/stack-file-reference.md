# Stack file reference

## File hierarchy

Stack files are merged in order using Docker's deep merge. Later files override earlier ones.

**Local mode:**

```
stack.yml -> stack.override.yml -> local.stack.yml -> local.stack.override.yml
```

**CI mode** (when `CI=true`):

```
stack.yml -> stack.override.yml -> ci.stack.yml -> ci.stack.override.yml
```

| File | Purpose | When you need it |
|------|---------|------------------|
| `stack.yml` | Service definitions, env var contract, route declarations. Source of truth. | Always. |
| `stack.override.yml` | Per-service values for cloned services (YAML anchors). | When you use `&anchor` / `*anchor` to duplicate services. |
| `local.stack.yml` | Local dev additions: dev databases, bind mounts, hot reload. | When local needs services or config that don't exist in prod. |
| `local.stack.override.yml` | Local dev values: dev RPC URLs, dummy credentials. | When local needs different values than prod for shared services. |
| `ci.stack.yml` | Production config: placement constraints, external networks. | When prod needs config that doesn't apply locally. |
| `ci.stack.override.yml` | Production secrets via `env_file`. | When prod values are injected from CI secrets. |

Override files exist because YAML anchors are shallow copies. When you clone with `*anchor`, the copy is exact. Docker Compose's deep merge lets you selectively change values in the override without replacing the entire section.

**If you don't use YAML anchors, you probably don't need override files.**

## x-rig extension

Every stack must define an `x-rig` block in `stack.yml`:

```yaml
x-rig:
  name: my-app
  routes:
    api.example.com: 3000
```

`name` is the stack's identity. `routes` declares how services are exposed through Caddy. If you omit `routes`, the stack deploys but nothing gets routed.

## Route formats

```yaml
# Port on the primary service (derived from hostname prefix)
api.example.com: 3000

# Explicit service + port
api.example.com: my-service:3000

# Full format with path routing and access control
api.example.com:
  /:
    target: http://api:3000/
    access: public
  /admin:
    target: http://admin-panel:8080/
    access: private
```

### Access levels

| Level | Description |
|-------|-------------|
| `internal` | (Default) Cluster network only |
| `local` | Host machine only |
| `private` | VPN / private network |
| `public` | Internet-facing |

Access enforcement beyond `public` isn't implemented yet. For now, don't use public hostnames for non-public services.

## Environment variable contract

`stack.yml` is the single source of truth for every env var the app reads.

```yaml
services:
  api:
    environment:
      DATABASE_HOST: postgres       # default value, shared
      REDIS_URL: redis://redis:6379 # default value, shared
      API_SECRET:                    # empty = must be provided per-environment
      LOG_LEVEL: ${LOG_LEVEL:-info} # interpolated with fallback
```

## Secrets

Treat dev secrets as compromised. Commit them. This means anyone can clone the repo and deploy locally without asking for credentials.

```yaml
secrets:
  api_key:
    file: ${API_KEY_FILE:-dev.key}  # CI injects real key, local uses dev.key
```

```yaml
environment:
  DB_PASSWORD: ${DB_PASSWORD:-dev_password_123}
```

In CI, production secrets come from GitHub Actions secrets via `env_file` in `ci.stack.override.yml`:

```yaml
services:
  api:
    env_file: $API_ENV_FILE
```

Rules:
- Dev secrets are committed and always work out of the box
- Production secrets never appear in the repo
- App code reads secrets from `/run/secrets/` and env vars via a validated helper

## Build targets

`$STACK_TARGET` controls which Dockerfile stage runs:

```dockerfile
FROM node:22 AS local
WORKDIR /app
CMD ["--watch", "."]

FROM local AS build
RUN npm run build

FROM node:22-slim AS ci
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
```

| STACK_TARGET | When | Behavior |
|-------------|------|----------|
| `local` | Dev machine | Source mounted, watch mode |
| `ci` | CI / prod | Compiled, minimal |

## The anchor / clone pattern

This is why override files exist. Real example -- a multi-chain deposit sweeper:

```yaml
# stack.yml
services:
  eth-sweeper: &sweeper
    build:
      target: $STACK_TARGET
    environment:
      DATABASE_HOST: mysql
      CHAIN_ID:
      CONFIRMATION_REQUIRED:

  pol-sweeper: *sweeper
  bsc-sweeper: *sweeper
```

```yaml
# stack.override.yml
services:
  eth-sweeper:
    environment:
      CHAIN_ID: 1
      CONFIRMATION_REQUIRED: 6

  pol-sweeper:
    environment:
      CHAIN_ID: 137
      CONFIRMATION_REQUIRED: 128

  bsc-sweeper:
    environment:
      CHAIN_ID: 56
      CONFIRMATION_REQUIRED: 15
```

Docker Compose merges the override on top of the base. Each service gets its own values while sharing everything from the anchor template.

## Injected variables

The CLI injects these into every deployment:

| Variable | Example | Purpose |
|----------|---------|---------|
| `TIMESTAMP` | `2026-03-20T14:00:00.000Z` | Forces restart when declared |
| `CLUSTER` | `local`, `dev`, `live` | Current deployment target |
| `CLUSTER_TLD` | `.localhost`, `.dev.example.com` | Top-level domain for the cluster |
| `STACK_REVIEW_ID` | `42` | PR number (empty on main) |
| `STACK_HOST_SUFFIX` | `.r42.dev.example.com` | Append to hostnames for env-aware URLs |
| `STACK_TARGET` | `local`, `ci` | Build target |

Usage:

```yaml
environment:
  WEBHOOK_URL: https://api.example.com${STACK_HOST_SUFFIX}/webhooks
```

Services should never hardcode hostnames. Always use `STACK_HOST_SUFFIX` to construct URLs that work across environments.
