# Review environments

Every pull request gets its own deployment on the cluster. The stack gets deployed with a PR-specific name and routes get a `.r{number}` suffix so multiple PRs can run simultaneously without conflicts. When the PR closes, the environment is automatically cleaned up.

## How it works

When working on a PR the CLI automatically switches to the review context for that PR. If the stack `name` in `stack.yml` is `my-app` and the PR number is `42`:

- The stack gets deployed as `my-app_r42`
- Route hostnames get a `.r42` label: `https://myapp.r42.dev.example.com`
- Locally: `https://myapp.r42.localhost`

The lifecycle:

- **PR opens/updates**: build images, push to GHCR, deploy as `{name}_r{pr_number}`, configure Caddy routes
- **PR closes/merges**: `rig rm` removes the stack, Caddy routes, and port range registration

> [!important]
>
> Review environments should only be deployed to a dev/staging cluster, not production.

## GitHub Actions workflow

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

jobs:
  build:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rig/action@v1
        with:
          command: build
          push: true
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy-review:
    if: github.event_name == 'pull_request' && github.event.action != 'closed'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: review/pr-${{ github.event.number }}
      url: https://app.example.com.r${{ github.event.number }}.dev.example.com
    steps:
      - uses: actions/checkout@v4
      - uses: rig/action@v1
        with:
          command: deploy
          cluster: dev
        env:
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
      - uses: rig/action@v1
        with:
          command: deploy
          cluster: live
        env:
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.LIVE_CLUSTER_IP }}

  cleanup-review:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rig/action@v1
        with:
          command: rm
          cluster: dev
        env:
          CLUSTER_SSH_KEY: ${{ secrets.CLUSTER_SSH_KEY }}
          CLUSTER_HOST: ${{ secrets.DEV_CLUSTER_IP }}
```

## Required secrets

| Secret | Description |
|--------|-------------|
| `CLUSTER_SSH_KEY` | Private SSH key for cluster access |
| `DEV_CLUSTER_IP` | IP address of the dev swarm manager |
| `LIVE_CLUSTER_IP` | IP address of the live swarm manager |

`GITHUB_TOKEN` is available automatically.

To create the SSH key pair:

```sh
ssh-keygen -t ed25519 -f rig-deploy -N ""
# Add rig-deploy.pub to ~/.ssh/authorized_keys on the cluster
# Add rig-deploy (private key) as CLUSTER_SSH_KEY in GitHub repo secrets
```

## GitHub Environments

The `environment:` key in the workflow creates entries in your repo's Environments tab. The URL shows up as a clickable link on the PR. The action updates deployment status automatically.

## Cleanup

Two mechanisms handle cleanup:

**1. PR close trigger** -- the `cleanup-review` job runs immediately when a PR closes. Handles the normal case.

**2. Scheduled cron** -- catches orphaned stacks from failed rm jobs, deleted branches, or other edge cases.

```yaml
on:
  schedule:
    - cron: '0 4 * * *'

jobs:
  cleanup-stale:
    runs-on: ubuntu-latest
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      GITHUB_REPOSITORY: ${{ github.repository }}
    steps:
      - uses: actions/checkout@v4
      - run: rig cleanup --max-age=48h
```

`rig cleanup` needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY` to check PR state -- it fatals without them. A review stack is removed if its PR is closed **or** if `--max-age=<duration>` is exceeded. Age is measured from the most recent service `UpdatedAt` in the stack, so a redeploy (empty commit, manual dispatch, PR sync) resets the clock.

## Redeploying

Three ways:

1. **Re-run the workflow** -- Actions tab, find the run, click "Re-run all jobs"
2. **Manual dispatch** -- Actions tab, "Run workflow" button, select cluster and optionally a PR number
3. **Empty commit** -- `git commit --allow-empty -m "redeploy" && git push`
