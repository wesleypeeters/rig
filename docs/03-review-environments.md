# Review environments

Every pull request gets its own deployment on the cluster. The stack gets deployed with a PR-specific name and routes get a `.r{number}` suffix so multiple PRs can run simultaneously without conflicts. When the PR closes, the environment is automatically cleaned up.

## How it works

In a GitHub Actions run for a pull request, rig deploys the review environment for that PR. If the stack `name` in `stack.yml` is `my-app` and the PR number is `42`:

- The stack gets deployed as `my-app_r42`
- Route hostnames get a `.r42` label: `https://myapp.r42.dev.example.com`

rig reads the PR number from the Actions event (a `pull_request` event, a `refs/pull/<n>/merge` ref, or a `pr_number` input on `workflow_dispatch`). Outside Actions every deploy is a regular one.

The lifecycle:

- **PR opens/updates**: build images, push to GHCR, deploy as `{name}_r{pr_number}`, configure Caddy routes
- **PR closes/merges**: `rig rm` removes the stack, Caddy routes, and port range registration

> [!important]
>
> Review environments should only be deployed to a dev/staging cluster, not production.

## GitHub Actions workflow

The action installs rig on the runner and, for `deploy`, `rm` and `cleanup`, points Docker at the cluster over SSH (`DOCKER_HOST=ssh://...`). rig itself runs on the runner, so it sees the whole GitHub context; only the Docker calls go to the manager. `build` uploads the lockfile as an artifact and `deploy` downloads it, so they can run as separate jobs.

```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, closed]
  workflow_dispatch:
    inputs:
      cluster:
        description: 'Target cluster'
        type: choice
        options:
          - dev
          - live
      pr_number:
        description: 'PR number (leave empty for main branch deploy)'
        type: string
        required: false

# One deploy per PR (or branch) at a time; a newer push waits for the running one.
concurrency:
  group: deploy-${{ github.event.pull_request.number || github.ref }}

jobs:
  build:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: wesleypeeters/rig/action@v1.4
        with:
          command: build
          push: true

  deploy-review:
    if: github.event_name == 'pull_request' && github.event.action != 'closed'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: review/pr-${{ github.event.number }}
      url: https://app.example.com.r${{ github.event.number }}.dev.example.com
    steps:
      - uses: actions/checkout@v4
      - uses: wesleypeeters/rig/action@v1.4
        with:
          command: deploy
          cluster: dev
        env:
          CLUSTER_TLD: .dev.example.com
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.DEV_CLUSTER_IP }}

  deploy-production:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com
    steps:
      - uses: actions/checkout@v4
      - uses: wesleypeeters/rig/action@v1.4
        with:
          command: deploy
          cluster: live
        env:
          CLUSTER_TLD: ""
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.LIVE_CLUSTER_IP }}

  cleanup-review:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: wesleypeeters/rig/action@v1.4
        with:
          command: rm
          cluster: dev
        env:
          CLUSTER_TLD: .dev.example.com
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.DEV_CLUSTER_IP }}
```

The step's `env:` is also where the stack's own configuration goes: every variable the stack reads (empty declarations, `${VAR}` interpolation, `x-rig-env` secrets) must be set there, typically from `vars.*` and `secrets.*` of the GitHub environment.

## Required secrets

| Secret | Description |
|--------|-------------|
| `CLUSTER_SSH_KEY` | Private SSH key for the swarm manager that runs Caddy |
| `DEV_CLUSTER_IP` | Address of the dev swarm manager |
| `LIVE_CLUSTER_IP` | Address of the live swarm manager |

Optional environment variables for the action: `CLUSTER_SSH_USER` (default `root`; the user must be allowed to use Docker) and `CLUSTER_KNOWN_HOSTS` (the manager's `known_hosts` line; without it the host key is trusted on first use). `GITHUB_TOKEN` is passed automatically through the action's `github-token` input.

To create the SSH key pair:

```sh
ssh-keygen -t ed25519 -f rig-deploy -N ""
# Add rig-deploy.pub to ~/.ssh/authorized_keys on the cluster
# Add rig-deploy (private key) as CLUSTER_SSH_KEY in GitHub repo secrets
```

### Self-hosted runners on the cluster

The action is one way to run rig from CI. The other is a self-hosted runner on the manager with rig installed: there, run `rig build` and `rig deploy` directly in a job with `CI: "true"`, `CLUSTER` and `CLUSTER_TLD` set, and carry `.rig/*.json` from the build job to the deploy job as an artifact yourself.

## GitHub Environments

The `environment:` key in the workflow creates entries in your repo's Environments tab. The URL shows up as a clickable link on the PR. GitHub Actions updates the deployment status automatically.

## Cleanup

Two mechanisms handle cleanup:

**1. PR close trigger** -- the `cleanup-review` job runs immediately when a PR closes. Handles the normal case.

**2. Scheduled cron** -- catches review environments a failed `rm` job left behind, including Caddy routes whose Swarm stack is already gone.

```yaml
on:
  schedule:
    - cron: '0 4 * * *'

jobs:
  cleanup-stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: wesleypeeters/rig/action@v1.4
        with:
          command: cleanup
          cluster: dev
          max-age: 48h
        env:
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.DEV_CLUSTER_IP }}
```

`rig cleanup` reads PR state from GitHub, so it needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY` (the action provides both). A review stack is removed if its PR is closed **or** if `--max-age=<duration>` is exceeded. Age is measured from the most recent service `UpdatedAt` in the stack, so a redeploy (empty commit, manual dispatch, PR sync) resets the clock. When GitHub can't say whether a PR is closed, cleanup prints a warning and judges the stack by age alone; a Caddy route without a Swarm stack has no age and is only removed once its PR is known to be closed.

## Redeploying

Three ways:

1. **Re-run the workflow** -- Actions tab, find the run, click "Re-run all jobs"
2. **Manual dispatch** -- Actions tab, "Run workflow" button, select cluster and optionally a PR number
3. **Empty commit** -- `git commit --allow-empty -m "redeploy" && git push`
