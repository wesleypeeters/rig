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

Environment variables can be defined in several places. To prevent confusion, follow these guidelines:

- Variables that are not environment-specific (always the same value everywhere) belong in `stack.yml`. Use [extensions](https://docs.docker.com/reference/compose-file/extension/) and [fragments](https://docs.docker.com/reference/compose-file/fragments/) to keep things DRY. You can also use the [env_file](https://docs.docker.com/reference/compose-file/services/#env_file) attribute to import variables at interpolation time.
- Avoid specifying variables in `local.stack.yml` or `ci.stack.yml` unless the values are truly environment-specific.
- `ci` environment variables targeting a specific cluster should be GitHub Actions secrets or environment variables scoped to that cluster.
- Secrets such as keys or passwords should _never_ be checked in as code for production. Use [Docker secrets](https://docs.docker.com/reference/compose-file/secrets/) and reference them from GitHub Actions secrets. Locally, use fallback values: `MY_VAR: ${MY_VAR:-my default value}`.
- Prefer YAML defaults over runtime import methods like `dotenv`.

```yaml
services:
  api:
    environment:
      DATABASE_HOST: postgres              # default, shared
      REDIS_URL: redis://redis:6379        # default, shared
      API_SECRET:                           # empty = must be provided per-environment
      LOG_LEVEL: ${LOG_LEVEL:-info}        # interpolated with fallback
```

# Secrets

The recommended approach is to treat all dev secrets as compromised and commit them. This means any developer can clone the repo, run `rig build && rig deploy`, and have a fully working local environment immediately.

**Docker secrets with dev fallbacks:**

```yaml
secrets:
  api_key:
    file: ${API_KEY_FILE:-dev.key}  # CI injects real key, local uses dev.key
```

**Environment variables with dev fallbacks:**

```yaml
environment:
  DB_PASSWORD: ${DB_PASSWORD:-dev_password_123}
```

**In CI (GitHub Actions):**

```yaml
# ci.stack.override.yml
services:
  api:
    env_file: $API_ENV_FILE    # GitHub Actions secret (file type)
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
