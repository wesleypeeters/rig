# Special variables

These variables are automatically injected into the environment when deploying. You can use them in your stack's YAML configuration.

<table>
<tr>
<th>Variable</th>
<th>Value</th>
<th>Common use</th>
</tr>
<tr>
<td>

`TIMESTAMP`
</td>
<td>

An ISO timestamp for the current date+time.

Example: `2026-03-20T14:00:00.000Z`
</td>
<td>

Force state change for a service so it will always be restarted when the stack is redeployed. Always use this with short-running services to prevent redeploys from timing out while waiting for a stopped service to start.

```yaml
api:
  environment:
    TIMESTAMP:
```
</td>
</tr>
<tr>
<td>

`CLUSTER`
</td>
<td>

The cluster being targeted. For example:

`local`, `dev`, `live`
</td>
<td>

Used to determine `CLUSTER_TLD`. Defaults to `local`.
</td>
</tr>
<tr>
<td>

`CLUSTER_TLD`
</td>
<td>

The TLD assigned to the cluster. For example:

`.localhost`, `.dev.example.com`
</td>
<td>

Useful for configuring allowed hosts for CORS. Defaults to `.localhost`.
</td>
</tr>
<tr>
<td>

`STACK_REVIEW_ID`
</td>
<td>

The PR number for which the review environment is deployed.

Example: `42`
</td>
<td>

Used to determine `STACK_HOST_SUFFIX`. Useful for GitHub API integrations.
</td>
</tr>
<tr>
<td>

`STACK_HOST_SUFFIX`
</td>
<td>

The suffix appended to hostnames for non-production environments. Examples: `.localhost`, `.r42.dev.example.com`
</td>
<td>

Certain services require you to specify their hostname or base URL. Place this variable after the production hostname:

```yaml
api:
  environment:
    BASE_URL: https://api.example.com${STACK_HOST_SUFFIX}
```

| Environment | Suffix | Resulting URL |
|------------|--------|---------------|
| Local | `.localhost` | `https://api.example.com.localhost` |
| Review #42 | `.r42.dev.example.com` | `https://api.example.com.r42.dev.example.com` |
| Production | (empty) | `https://api.example.com` |
</td>
</tr>
<tr>
<td>

`STACK_TARGET`
</td>
<td>

The targeted build config. Either `local` or `ci`.
</td>
<td>

Target a stage in a multi-stage Dockerfile without needing separate local and ci stack files.

```yaml
api:
  build:
    target: $STACK_TARGET
```
</td>
</tr>
</table>
