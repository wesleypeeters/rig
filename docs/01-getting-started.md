# Getting started

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Swarm mode enabled (`docker swarm init`)
- [Deno](https://deno.com) installed

## Install rig

```sh
deno task install
```

Verify it works:

```sh
rig
```

## Bootstrap Caddy

Caddy is the reverse proxy that sits in front of all your stacks. It runs as its own Swarm stack and needs to be deployed once per machine/cluster.

```sh
cd caddy
rig build
rig deploy
rig caddy init
rig caddy trust    # installs the local root CA -- will ask for your password
cd ..
```

After this, `https://localhost` should respond.

## Create a stack

Create a `stack.yml` in your project:

```yaml
x-rig:
  name: myapp
  routes:
    myapp: "api:3000"

services:
  api:
    build:
      target: $STACK_TARGET
    environment:
      PORT: 3000
```

The `x-rig` block is the only thing specific to rig. Everything else is standard Swarm stack syntax.

Route keys are hostnames without the cluster TLD. Locally, `myapp` becomes accessible at `https://myapp.localhost`. On a remote cluster with `CLUSTER_TLD=.dev.example.com`, the same route becomes `https://myapp.dev.example.com`.

> [!important]
>
> Don't include the TLD in your route keys. The TLD is added by DNS and stripped by Caddy automatically.

## Build and deploy

```sh
rig build
rig deploy
```

Open `https://myapp.localhost`. Done.

## What just happened

1. `rig build` used `docker buildx bake` to build all services with a build context, resolved image digests for everything else, and wrote a lockfile to `.rig/default.json`
2. `rig deploy` merged your stack files, pinned all images to exact digests from the lockfile, allocated a port range, deployed to Swarm, and configured Caddy routes

## What's next

- [Defining stacks](02-defining-stacks.md) for the full config format, route options, secrets, and the anchor/clone pattern
- [Review environments](03-review-environments.md) for setting up CI/CD with GitHub Actions
- [Cluster setup](04-cluster-setup.md) for deploying to a remote server
