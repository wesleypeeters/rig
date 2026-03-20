# rig

Docker Swarm deployment orchestrator with dynamic Caddy routing, review environments, and GitHub Actions integration.

Wraps `docker stack`, `docker buildx bake`, and Caddy's admin API into a single CLI so deploying multi-service stacks isn't painful.

- Layered YAML config -- write once, override per environment
- Dynamic reverse proxy routing via Caddy, zero downtime
- Review environments per PR with automatic cleanup
- Image digest locking for reproducible deployments
- Ships as a reusable GitHub Action

## Install

Requires [Deno](https://deno.com) and Docker with Swarm mode enabled.

```sh
deno install -n rig -gfA src/main.ts
```

## Quick start

```yaml
# stack.yml
x-stack:
  name: hello
  routes:
    hello.localhost: 3000

services:
  api:
    image: nginx
```

```sh
# First time only: bootstrap caddy
cd caddy && rig build && rig deploy && rig caddy init && rig caddy trust && cd ..

# Deploy your stack
rig deploy
# -> https://hello.localhost
```

## Docs

- [Getting started](docs/getting-started.md)
- [Stack file reference](docs/stack-file-reference.md)
- [Review environments](docs/review-environments.md)
- [Cluster setup](docs/cluster-setup.md)
- [Caddy integration](docs/caddy-integration.md)

## License

MIT
