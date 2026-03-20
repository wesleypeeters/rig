# Getting started

From zero to a running local deployment in 10 minutes.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Swarm mode enabled (`docker swarm init`)
- [Deno](https://deno.com) installed

## Install rig

```sh
deno install -n rig -gfA src/main.ts
```

Verify it works:

```sh
rig
```

## Bootstrap Caddy

Caddy is the reverse proxy that sits in front of all your stacks. It runs as its own Swarm stack and needs to be deployed once per cluster.

```sh
cd caddy
rig build
rig deploy
rig caddy init
rig caddy trust    # installs the local root CA -- will ask for your password
cd ..
```

After this, `https://localhost` should show "rig is running".

## Create a stack

Create a `stack.yml` in your project:

```yaml
x-stack:
  name: myapp
  routes:
    myapp.localhost: 3000

services:
  api:
    build:
      target: $STACK_TARGET
    environment:
      PORT: 3000
```

The `x-stack` block is the only thing specific to rig. Everything else is standard Docker Compose / Swarm syntax.

## Deploy

```sh
rig build
rig deploy
```

Open `https://myapp.localhost`. Done.

## What's next

- [Stack file reference](stack-file-reference.md) for the full config format and route options
- [Review environments](review-environments.md) for setting up CI/CD with GitHub Actions
- [Cluster setup](cluster-setup.md) for deploying to a remote server
