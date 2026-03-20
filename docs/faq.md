# FAQ

<details>
<summary>What happens when I deploy a stack?</summary>

Before deploying, `rig build` resolves the digests for all images referenced by the stack's services. This produces a lockfile that allows for idempotent deployments. When deploying, Docker Swarm analyzes the differences between the active state and the desired state and only restarts affected services. Caddy routes are configured to proxy traffic to the right ports.

</details>

<details>
<summary>What's a review environment?</summary>

A review environment is a temporary deployment on the cluster where progress on a PR can be reviewed. Each PR gets its own: if your stack is named `my-app` and the PR number is `42`, it gets deployed as `my-app_r42`. Routes get a `.r42` suffix, e.g. `https://myapp.r42.dev.example.com`. By default review environments are removed when the PR closes. See [review environments](review-environments.md) for the full setup.

</details>

<details>
<summary>How do I expose a service to the public?</summary>

Only services deployed to a cluster with public DNS should be made public. Add a route in `stack.yml` that uses a public hostname with `access: public`. Make sure the hostname's DNS points to the cluster. See [defining stacks](defining-stacks.md#exposing-services).

</details>

<details>
<summary>How do I roll back a deployment?</summary>

Use `rig rollback` to switch to a previous lockfile, then `rig deploy` to apply it. The lockfile pins every image to an exact digest so rollback is deterministic.

```sh
rig rollback
rig deploy
```

You can also re-run a previous GitHub Actions workflow run from the Actions tab.

</details>

<details>
<summary>How do I force-restart a service?</summary>

Redeploying only restarts services whose definition changed. To force a restart, add `TIMESTAMP:` to the service's environment. See [advanced topics](advanced-topics.md#force-restart-when-deploying).

</details>

<details>
<summary>How can I perform configuration changes without rebuilding?</summary>

If you only need to change environment variables or secrets (managed via GitHub Actions secrets), you can just redeploy without rebuilding. The simplest method is to re-run the deploy workflow from the GitHub Actions tab.

</details>

<details>
<summary>Why isn't my stack allowed to deploy in CI mode?</summary>

CI mode enforces governance rules to guarantee isolation and prevent conflicts. Your services can't directly expose ports (use `routes` instead) and you can't use host-mounted volumes. Admins listed in the `RIG_ADMINS` environment variable are exempt. To test locally:

```sh
CI=true rig validate
```

</details>

<details>
<summary>What about storing data on the cluster?</summary>

Container filesystems are ephemeral. For persistent data, use volume mounts and pin the service to a specific node with placement constraints. Without this you'll get split-brain when the service moves to a different node. See [advanced topics](advanced-topics.md#storing-data-on-the-cluster).

</details>

<details>
<summary>What if I want to rename my stack?</summary>

You'll need to remove the old stack, rename it, and redeploy. Any data in volumes will need to be backed up and restored. See [advanced topics](advanced-topics.md#renaming-a-stack).

</details>

<details>
<summary>Can I run short-lived jobs on Swarm?</summary>

Yes, with a workaround. Swarm expects services to stay up so you need to sleep briefly, use the `TIMESTAMP` trick, and set `restart_policy.condition: on-failure`. See [advanced topics](advanced-topics.md#short-running-jobs).

</details>
