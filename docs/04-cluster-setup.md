# Cluster setup

How to set up a new cluster from scratch.

## Prerequisites

- 1+ Linux nodes with Docker installed
- SSH access from CI to the primary swarm manager
- Ports 80 and 443 available on the edge node
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

## Deploy Caddy

Clone this repo on the cluster (or rsync it), then:

```sh
cd caddy
rig build
rig deploy
rig caddy init .dev.example.com   # use your cluster's TLD
```

The TLD argument tells Caddy how to strip the cluster-specific suffix from incoming hostnames so upstream services get clean host headers. See [Caddy integration](05-caddy-integration.md) for details.

## DNS

### Real subdomains (recommended)

Point a wildcard DNS record at your cluster:

```
*.dev.example.com -> A -> <cluster-ip>
```

Set `CLUSTER_TLD=.dev.example.com` on the cluster.

Review environments like `api.example.com.r42.dev.example.com` resolve via public DNS. Caddy provisions TLS certificates via Let's Encrypt automatically.

This is the simplest approach. Review environment links work for anyone without VPN setup.

### Private DNS + VPN (advanced)

For teams that need fully private review environments:

1. Run CoreDNS on the cluster resolving `*.devhost` to the cluster IP
2. Set up WireGuard VPN routing DNS through CoreDNS
3. Install Caddy's root CA on client machines (`rig caddy trust`)
4. Register the TLD: `rig caddy tld devhost`

Set `CLUSTER_TLD=.devhost` on the cluster.

### CLUSTER_TLD values

| CLUSTER_TLD | Approach | Example hostname |
|-------------|----------|------------------|
| `.localhost` | Local dev (default) | `api.example.com.localhost` |
| `.dev.example.com` | Real subdomain | `api.example.com.r42.dev.example.com` |
| `.devhost` | Private DNS + VPN | `api.example.com.r42.devhost` |
| (empty) | Production | `api.example.com` |

## TLS

- **Real subdomains**: automatic via Let's Encrypt (HTTP-01 challenge)
- **Wildcard certs**: DNS-01 challenge with Cloudflare plugin. Set `CF_API_TOKEN` in Caddy's environment.
- **Private TLDs**: internal CA. Run `rig caddy tld <name>` to register, then `rig caddy trust` on client machines.

## CI access

Generate a deploy key and store it as a GitHub secret:

```sh
ssh-keygen -t ed25519 -f rig-deploy -N ""
```

Add the public key to `~/.ssh/authorized_keys` on the swarm manager. Store the private key as `CLUSTER_SSH_KEY` and the manager IP as `CLUSTER_HOST` in your GitHub repo secrets.

## Production

For production clusters, set `CLUSTER_TLD` to an empty string. Hostnames are used as-is (no suffix). Only deploy on push to main. See the [review environments](03-review-environments.md) workflow for the full setup.
