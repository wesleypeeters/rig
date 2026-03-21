# Defining stacks

This tool expects [standard Docker Swarm stack definitions](https://docs.docker.com/reference/compose-file/) in the project root using the following naming convention:

- `stack.yml` contains the main stack definition
- `stack.override.yml` is useful for extending deep-cloned structures
- `local.stack.yml` will be merged in `local` mode if it exists (also `local.stack.override.yml`)
- `ci.stack.yml` will be merged in `ci` mode if it exists (also `ci.stack.override.yml`)

You should only define things in `local` that you don't want in `ci` mode. Accordingly, you should only define things in `ci` that you don't want in `local` mode.

For example, placement constraints should likely only apply to `ci` mode and host-mounted volumes should only ever be used in `local` mode as those aren't allowed in `ci` mode.

Any configuration specific to rig is expected under a global extension section named `x-rig`.

In order to be identifiable on the cluster a stack must specify its name:

```yaml
# stack.yml
x-rig:
  name: my-stack

services:
  # your services here
```

> [!caution]
>
> In Swarm mode only a subset of the [Compose specification](https://docs.docker.com/reference/compose-file/) applies or is supported. These differences are poorly documented.

# Exposing services

Services listening for HTTP requests can be exposed through Caddy via routes. Here's a basic example:

```yaml
x-rig:
  name: my-stack
  routes:
    hello:
      /:
        target: http://hello:80/
```

This means: expose port `80` of the `hello` service as `https://hello.localhost/` (locally) or `https://hello.dev.example.com/` (on a remote cluster).

We can write this much simpler because rig fills in defaults:

```yaml
x-rig:
  name: my-stack
  routes:
    hello:
```

> [!tip]
>
> You can use `rig config` to see the fully expanded YAML output.

From the above example we can deduce:

- If no target protocol is specified, `http:` is assumed
- If no target port is specified, port `80` is assumed
- If no target pathname is specified, the root path `/` is assumed
- You can use a string instead of an object specifying a `target` in which case the string is treated as the target
- You can use an integer instead of an object in which case the hostname will be used as the service name and the integer as the port

Here are some of the ways routes can be specified:

```yaml
x-rig:
  name: my-stack
  routes:
    hello-1:
    hello-2: 8080
    hello-3: foo
    hello-4: "foo:1234"
    hello-5:
      /: foo
    hello-6:
      /: 8080
    hello-7:
      /:
        target: "foo:1234"
    hello-8 hello-9 *.hello.com:
      /:
        target: "foo:1234"
    api.example.com:
```

Some things to note:

- You can specify multiple hostnames (or wildcards) under `routes:` by separating them with spaces (e.g. `hello-8 hello-9 *.hello.com:`) in which case the first hostname will be used as the default service name
- If the first hostname contains a `.` then the first segment (e.g. `api`) will be used as the default service name. Service names containing `.` are not allowed.
- Only the `/` pathname is supported at the moment
- Values that contain a `:` must be quoted in YAML (e.g. `"foo:1234"`)

Besides `target:` you can also specify:

- `access:` sets the access level for the route

  Each level inherits from the levels below:
  - `none` -- block access (intended to override the access level for a subroute)
  - `internal` -- (default) accessible by other stacks on the cluster
  - `local` -- accessible from the local host
  - `private` -- accessible from private network IPs (e.g. via VPN)
  - `public` -- accessible from anywhere

> [!note]
>
> Access level enforcement beyond `public` is not yet implemented. For now, don't use public hostnames for services that shouldn't be publicly accessible.

```yaml
# More complete example
x-rig:
  name: my-stack
  routes:
    api.hello.com:
      /:
        access: public
    adminapi:
      /:
        target: "api:81"
        access: private

services:
  api:
    build:
      target: $STACK_TARGET
```

# Private hostnames

All hostnames used in routes can be suffixed with a cluster TLD. Out-of-the-box, `.localhost` is supported, meaning you can access `https://hello.localhost/`, `https://api.hello.com.localhost/` etc. This is an OS-level feature where all hostnames ending in `.localhost` resolve to `127.0.0.1`.

For remote clusters you configure the TLD through the `CLUSTER_TLD` environment variable. See [cluster setup](04-cluster-setup.md) for details.

> [!important]
>
> Don't include the TLD in your routes. Caddy is configured to strip the TLD from the host header automatically.
>
> Only use public hostnames (FQDNs) for services that must be publicly accessible.

# Using environment variables

This is arguably the most important section. Environment variable management is the primary way services are configured.

### stack.yml is the contract

Every environment variable the application reads MUST be declared in `stack.yml`. This makes it the single source of truth for what config the application expects. If a variable isn't in `stack.yml`, it doesn't exist as far as the stack is concerned.

### Priority order (highest to lowest)

1. **Docker secrets** (`/run/secrets/<name>`) -- for sensitive data only
2. **env_file** -- loaded from file path (used in `ci.stack.override.yml` for per-environment config)
3. **environment section** -- defined in stack files
4. **.env file** -- auto-loaded by Docker Buildx (local dev only, git-ignored)
5. **Hardcoded fallbacks** -- `${VAR:-default}` syntax in stack files

### Declaration patterns

**Empty declarations** mean "value provided elsewhere":
```yaml
environment:
  DATABASE_HOST: mysql          # Has a default -- shared across environments
  CHAIN_ID:                     # Empty -- MUST be set per-service in stack.override.yml
  API_KEY:                      # Empty -- set via .env locally, env_file in CI
```

**Default values** use Docker Compose interpolation:
```yaml
environment:
  LOG_LEVEL: ${LOG_LEVEL:-debug}           # Falls back to "debug" if unset
  DB_PASSWORD: ${DB_PASSWORD:-localpass}    # Falls back for local dev
```

> [!caution]
>
> `${VAR:-}` (fallback to empty string) is an antipattern. It's identical to just writing `VAR:` but adds noise. If there's no actual fallback value, use an empty declaration.

**Required values** that must be set or the stack fails to deploy:
```yaml
environment:
  CRITICAL_KEY: ${CRITICAL_KEY:?}    # Fails with error if not set
```

### Where to put what

| What | Where | Example |
|------|-------|---------|
| Shared defaults | `stack.yml` environment | `BATCH_SIZE: 50` |
| Per-service values | `stack.override.yml` | `CHAIN_ID: 137` |
| Local dev values | `local.stack.override.yml` | `RPC_URL: http://devnet:8545` |
| Local dev secrets | `.env` (git-ignored) | `API_KEY=sk-...` |
| CI/production config | `ci.stack.override.yml` via `env_file` | `env_file: $MY_SERVICE_ENV_FILE` |
| Sensitive credentials | Docker secrets | `file: $MY_SECRET_FILE` |

### Rules

- **stack.yml is the contract** -- declare every env var the app reads
- Variables that are not environment-specific belong in `stack.yml` with defaults. Use [extensions](https://docs.docker.com/reference/compose-file/extension/) and [fragments](https://docs.docker.com/reference/compose-file/fragments/) to keep things DRY.
- Avoid specifying variables in `local.stack.yml` or `ci.stack.yml` unless the values are truly environment-specific
- CI environment variables targeting a specific cluster should be GitHub Actions secrets or environment variables scoped to that cluster
- Never commit real secrets. The `.env` file is for local development only.
- Prefer YAML defaults over runtime import methods like `dotenv`
- Never read env vars directly in application code (e.g. `process.env.MY_VAR`). Use a validated helper that checks types and fails fast on missing values. This catches misconfigurations at startup instead of at runtime.

# Secrets & configs

### Docker secrets

For sensitive data (private keys, API tokens, credentials), use Docker secrets instead of environment variables. Secrets are mounted at `/run/secrets/<secret_name>` inside the container.

```yaml
# stack.yml
secrets:
  relayer_key:
    file: ${RELAYER_KEY_FILE:-dev.key}    # CI provides real key, local uses dev.key

services:
  api:
    secrets:
      - relayer_key
```

Reading in application code:

```typescript
const secret = await fs.readFile('/run/secrets/relayer_key', 'utf8');
```

In CI (GitHub Actions), create a secret containing the file path and reference it in the stack. Locally, commit a `dev.key` file with throwaway credentials that only work against dev infrastructure.

### Docker configs

Similar to secrets but for non-sensitive configuration files. Mounted at `/<config_name>` by default.

```yaml
configs:
  my_config:
    file: $MY_CONFIG_FILE

services:
  api:
    configs:
      - my_config
```

### Immutability

Docker secrets and configs are immutable in Swarm -- you can't update them in place. Rig handles this automatically by hashing file contents into the name, so you don't need to worry about it.

### When to use secrets vs environment variables

Use Docker secrets for anything that would be dangerous if leaked: private keys, API tokens, database passwords, webhook signing secrets. Use environment variables for everything else: feature flags, URLs, port numbers, log levels.

The dev fallback pattern works the same either way:

```yaml
# Secrets with dev fallback
secrets:
  api_token:
    file: ${API_TOKEN_FILE:-dev.token}

# Env vars with dev fallback
environment:
  DB_PASSWORD: ${DB_PASSWORD:-dev_password_123}
```

Rules:
- Dev secrets are committed and always work out of the box
- Production secrets never appear in the repo -- they come from GitHub secrets
- Any secret that appears in the repo should only grant access to local/dev infrastructure

# Build targets

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

This is useful because it lets you target a stage in a multi-stage Dockerfile without having to maintain separate `local.stack.yml` and `ci.stack.yml` files for the build config.

# The anchor / clone pattern

This is the primary reason override files exist. When you clone a service with a YAML anchor (`*anchor`), the copy is exact -- YAML itself provides no way to selectively change values. Docker's deep merge across multiple files solves this.

Real example -- a multi-chain deposit sweeper:

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

Docker Compose merges the override on top of the base. Each service ends up with its own chain-specific values while sharing everything from the anchor template.

**If you don't use YAML anchors to clone services, you probably don't need override files at all.**
