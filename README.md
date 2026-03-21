# rig

A wrapper around `docker stack`, `docker buildx bake` and Caddy for deploying and managing stacks on Docker Swarm clusters. Works locally and in CI, so the workflow on your machine is representative of what happens on the cluster.

## How to use

### Prerequisites

[Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) and [Deno](https://docs.deno.com/runtime/getting_started/installation/) must be installed. Docker Swarm must be initialized (`docker swarm init`).

### Installation

Check out this repository and from its root run:

```sh
deno task install
```

Once installed, deploy and initialize Caddy (the reverse proxy that sits in front of all your stacks):

```sh
cd caddy
rig build
rig deploy
rig caddy init
rig caddy trust    # installs local root CA -- will ask for your password
cd ..
```

### The `rig` command

You can now use the global `rig` command. Run it to see what it can do:

```sh
rig
```

The `rig` command looks in the current directory for `stack.yml`. This file is interpreted as a Docker Swarm stack definition. The `rig` command expects an extension section named `x-rig` which must specify a `name` property. For more detailed information about specifying stacks and routes, have a look at the [docs](docs/).

The subcommands can run in two modes: `local` (default) or `ci`. Depending on the mode the `local.stack.yml` or `ci.stack.yml` file (if it exists) will be merged into the `stack.yml` file. CI mode enforces cluster governance rules.

To deploy a stack locally:

```sh
rig build
rig deploy
```

To use CI mode locally for verification:

```sh
CI=true rig config
CI=true rig validate
```

Note that the stack environment only specifies which configuration to use -- it doesn't control where the stack is going to be deployed. That's controlled by the `DOCKER_HOST` environment variable or `docker context use`. Typically you won't be performing remote cluster deployments locally as that's what CI is for.

## Docs

- [Getting started](docs/01-getting-started.md) -- from zero to first deployment
- [Defining stacks](docs/02-defining-stacks.md) -- stack files, routes, environment variables, secrets
- [Review environments](docs/03-review-environments.md) -- per-PR deployments with GitHub Actions
- [Cluster setup](docs/04-cluster-setup.md) -- setting up a new Swarm cluster
- [Caddy integration](docs/05-caddy-integration.md) -- reverse proxy internals and troubleshooting
- [Advanced topics](docs/06-advanced-topics.md) -- force-restart, short-running jobs, tuning, exec access
- [Special variables](docs/07-special-variables.md) -- injected environment variables reference
- [FAQ](docs/08-faq.md) -- common questions answered

## Development

This project uses the Deno TypeScript runtime. In `src/commands` you'll find the entrypoints for each subcommand.

### Deno tasks

The `dev` task watches for changes and reruns tests automatically:

```sh
deno task dev
```

The `test` task runs all tests and writes a code coverage report to `out/coverage`.

## License

MIT
