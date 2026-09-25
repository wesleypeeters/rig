# Cluster setup

How to set up a new cluster from scratch.

## Prerequisites

- 1+ Linux nodes with Docker installed
- SSH access from CI to the swarm manager that runs Caddy (the node labelled `index=0` below), as a user allowed to use Docker
- Ports 80 and 443 available on that node
- A domain with DNS configured (for review environments)

## Initialize Swarm

```sh
docker swarm init
```

For multi-node clusters:

```sh
# Get the join token on the manager
docker swarm join-token worker

# Run the join command on each worker
docker swarm join --token <token> <manager-ip>:2377
```

Label nodes with an index for placement constraints:

```sh
docker node update --label-add index=0 node-1
docker node update --label-add index=1 node-2
```

Only use placement constraints in `ci.stack.yml`. Local mode is always single-node.

## Size the ingress network

Swarm creates a default `ingress` overlay on `swarm init` but the default subnet may overlap your private cluster network or be too small for review environment churn. Recreate it with a generous `/16` before deploying anything:

```sh
docker network rm ingress
docker network create --driver overlay --ingress \
  --subnet=10.20.0.0/16 --gateway=10.20.0.1 ingress
```

Pick a `/16` that doesn't overlap your private cluster network. See [advanced topics: ingress IP exhaustion](06-advanced-topics.md#ingress-ip-exhaustion) for why this matters and how to recover if it's too late.

## Deploy Caddy

On the manager that will run Caddy, clone this repo, install rig from it, build Caddy's image, and deploy it from the `caddy` directory in CI mode, so `caddy/ci.stack.yml` applies (host-mode ports, so Caddy sees real client IPs, and placement on the `index=0` node). Build without `CI=true`: in CI mode `rig build` pushes, and this image stays on the node.

```sh
git clone https://github.com/wesleypeeters/rig.git /opt/rig
cd /opt/rig && deno task install
cd caddy
rig build
CI=true CLUSTER=dev rig deploy
rig caddy init .dev.example.com                                 # use your cluster's TLD
rig caddy init .dev.example.com --private-subnet=10.8.0.0/24   # with a VPN subnet
```

> [!important]
>
> Always deploy Caddy on a cluster with `CI=true` (and run `rig update` there as `CI=true CLUSTER=<name> rig update`, which builds without it and deploys with it). Without it rig merges `caddy/local.stack.yml`, which publishes 80/443 through Swarm's ingress mesh: Caddy then sees the ingress address instead of the client IP and `access: private` stops working.

The TLD argument tells Caddy how to strip the cluster-specific suffix from incoming hostnames so upstream services get clean host headers. The optional `--private-subnet` flag configures which IP range is allowed to access routes marked `access: private` (e.g. your VPN subnet). Multiple subnets can be comma-separated. Pick a subnet that doesn't overlap Swarm's `ingress` network (see above). See [Caddy integration](05-caddy-integration.md) for details.

Running `rig caddy init` again on a live cluster is safe: it keeps the deployed routes, port ranges and everything else rig didn't author, and flags you leave out keep their current values. See [what `init` owns](05-caddy-integration.md#what-init-owns-and-what-it-leaves-alone).

## Firewall the published port ranges

Every routed service is published on a host port in `49160-65529`, on every node, through Swarm's ingress mesh. Anyone who can reach a node on those ports reaches the service directly, bypassing Caddy: no TLS, no `access: private` check. Docker's published ports also bypass `ufw`.

Block `49160-65529` from outside the cluster at your provider's firewall, or in the `DOCKER-USER` iptables chain on every node. Caddy reaches the services from the node it runs on, so nothing legitimate needs those ports from outside.

## DNS

### Real subdomains (recommended)

Point a wildcard DNS record at your cluster:

```
*.dev.example.com -> A -> <cluster-ip>
```

Set `CLUSTER_TLD=.dev.example.com` in the environment of every CI step that runs rig for this cluster (see [review environments](03-review-environments.md#github-actions-workflow)).

Review environments like `api.example.com.r42.dev.example.com` resolve via public DNS. Caddy provisions TLS certificates automatically, on-demand and scoped to the hostnames rig is actually serving (see [Caddy integration: public ACME allowlist](05-caddy-integration.md#public-acme-is-scoped-to-the-deployed-host-allowlist)).

This is the simplest approach. Review environment links work for anyone without VPN setup.

### Private DNS + VPN (advanced)

For teams that need fully private review environments:

1. Run CoreDNS on the cluster resolving `*.devhost` to the cluster IP
2. Set up WireGuard VPN routing DNS through CoreDNS
3. Initialize Caddy with the private TLD and VPN subnet: `rig caddy init .devhost --private-subnet=10.8.0.0/24`
4. Register the TLD for internal certificate issuance: `rig caddy tld devhost`
5. Install Caddy's root CA on client machines: `rig caddy trust`
6. Mark routes that should require VPN access with `access: private` in your stack's `x-rig` routes

Set `CLUSTER_TLD=.devhost` for the CI steps that deploy to this cluster. Requests to `private` routes from outside the VPN subnet receive a `403 Forbidden` response.

### CLUSTER_TLD values

| CLUSTER_TLD | Approach | Example hostname |
|-------------|----------|------------------|
| `.localhost` | Local dev (default) | `api.example.com.localhost` |
| `.dev.example.com` | Real subdomain | `api.example.com.r42.dev.example.com` |
| `.devhost` | Private DNS + VPN | `api.example.com.r42.devhost` |
| (empty) | Production | `api.example.com` |

## TLS

- **Real subdomains**: automatic via ACME (Let's Encrypt by default), issued on-demand and scoped to the deployed-host allowlist (see [Caddy integration: TLS](05-caddy-integration.md#tls)). On busy review-env clusters, switch the issuer to [ZeroSSL](05-caddy-integration.md#switch-to-zerossl-to-dodge-le-rate-limits) to dodge rate limits.
- **Wildcard certs**: DNS-01 challenge through the Cloudflare DNS plugin built into rig's Caddy. `rig caddy init` doesn't configure this: add an automation policy with a `cloudflare` DNS provider and API token, and list the wildcard under `tls.certificates.automate`, through the admin API. Re-running `init` keeps both.
- **Private TLDs**: internal CA. Run `rig caddy tld <name>` to register, then `rig caddy trust` on client machines.

## CI access

Generate a deploy key and store it as a GitHub secret:

```sh
ssh-keygen -t ed25519 -f rig-deploy -N ""
```

Add the public key to `~/.ssh/authorized_keys` on the manager that runs Caddy. Store the private key as `CLUSTER_SSH_KEY` and the manager's address as a secret passed to the action as `CLUSTER_HOST`. The deploy key can run any Docker command on the manager, which is root-equivalent; treat it that way, and see [why governance isn't a security boundary](06-advanced-topics.md#governance-is-a-guard-rail).

## Production

For production deploys, set `CLUSTER_TLD` to an empty string: hostnames are used as-is (no suffix). Only deploy on push to main. See the [review environments](03-review-environments.md) workflow for the full setup.

Production hostnames need certificates configured by hand. rig's public allowlist only covers `<route><cluster TLD>` names, and `rig caddy init` always records a cluster TLD, so a bare `api.example.com` is never on it. Add an automation policy for the production domain and list its hostnames (or a wildcard, via DNS-01) under `tls.certificates.automate`; `rig caddy init` keeps both.
