# Caddy integration

How Caddy is configured and how routing works under the hood.

## Architecture

Caddy runs as a dedicated Swarm stack deployed once per cluster. It listens on `:443` (and `:80` for ACME challenges and HTTP->HTTPS upgrades). All configuration is managed through Caddy's admin API at `localhost:2019`.

The admin API is never exposed to the network. The CLI accesses it by running `curl` inside the Caddy container via `docker exec`.

## Port range allocation

### The problem

Caddy runs in its own stack. Application stacks run on isolated overlay networks. Caddy can't resolve service names across stack boundaries because Docker Swarm scopes overlay networks per stack.

The alternative -- a shared external overlay -- would require every service to explicitly join it, which adds boilerplate everywhere and creates a debugging trap when someone forgets the default network membership.

### The solution

The CLI allocates a range of 10 host ports per stack and publishes services on those ports. Caddy reverse proxies to `host:{port}` on the Docker host. Stack files stay clean because services don't know or care about Caddy.

Port space: `49160-65529` on clusters, `45000-49150` on Docker Desktop (avoids ephemeral port conflicts).

Allocation flow:

1. CLI reads claimed port ranges from Caddy's config
2. CLI finds the next unclaimed range ID
3. CLI maps each routed service to a port within the range
4. Services are published on those host ports via `docker stack deploy`
5. Caddy routes are configured to upstream to `host:{port}`
6. The range ID is stored in Caddy's config

When a stack is removed, its port range registration is deleted from Caddy so it can be reused.

## Config structure

```
@stacks (server)
  routes[]
    handle[0] -> global vars handler (@vars)
      portRanges[] -> [{ @id: 0 }, { @id: 1 }, ...]
      requestHost -> {http.request.host}
    handle[1] -> strip host header handler
    {stack_id} -> stack route
      handle[0] -> vars (portRangeId)
      handle[1] -> subroute
        routes[] -> per-hostname reverse proxy rules
    localhost -> health check
```

Per-stack route:

```json
{
  "@id": "my-app",
  "handle": [
    {
      "handler": "vars",
      "portRangeId": 0
    },
    {
      "handler": "subroute",
      "routes": [
        {
          "handle": [{
            "handler": "reverse_proxy",
            "upstreams": [{ "dial": "host:49160" }]
          }],
          "match": [{ "host": ["api.example.com"] }],
          "terminal": true
        }
      ]
    }
  ]
}
```

Every configurable object has an `@id` for direct addressing via `GET/PUT/PATCH/DELETE /id/{id}`.

## Host header handling

The global route handler does two things:

1. Stores the original request host in `{http.vars.requestHost}`
2. Strips the cluster TLD from the Host header

The reverse proxy then restores the original host via the stored variable:

```json
"headers": {
  "request": {
    "set": {
      "Host": ["{http.vars.requestHost}"],
      "X-Forwarded-Host": ["{http.vars.requestHost}"]
    }
  }
}
```

This means upstream services always receive the original hostname, not the stripped version.

For review environments, hostnames get a `.r{pr_number}` suffix before the cluster TLD:

- Production: `api.example.com`
- Review #42: `api.example.com.r42.dev.example.com`

## TLS

| Hostname type | Certificate method |
|---------------|-------------------|
| `*.localhost` | Caddy internal CA (on-demand) |
| Custom private TLDs | Caddy internal CA (on-demand) |
| Public FQDNs | ACME HTTP-01 (Let's Encrypt) |
| Wildcard public domains | ACME DNS-01 (Cloudflare plugin) |

The custom Caddy build includes the Cloudflare DNS plugin and the Cloudflare IP module for trusted proxy headers.

## Custom build

The `caddy/Dockerfile` builds Caddy with two plugins:

- `caddy-dns/cloudflare` -- DNS-01 ACME challenges for wildcard certs
- `WeidiDeng/caddy-cloudflare-ip` -- recognizes Cloudflare proxy IPs for `X-Forwarded-For` trust

It also includes `curl` for the admin API client.

## Troubleshooting

**"Certificate not trusted"**
- Local: run `rig caddy trust`
- Remote with real subdomains: check ACME logs (`rig caddy log DEBUG`, wait, check Caddy container logs)

**"502 Bad Gateway"**
- Service isn't running or wrong port mapping
- Check `rig show` to see if services are up
- Check Caddy config: `docker exec <caddy-id> curl -s http://127.0.0.1:2019/id/<stack-name> | jq`

**Route not found**
- Verify the stack has routes in Caddy: `docker exec <caddy-id> curl -s http://127.0.0.1:2019/id/<stack-name>`
- If missing, redeploy: `rig deploy`

**Inspect live Caddy config**
```sh
docker exec <caddy-id> curl -s http://127.0.0.1:2019/config/ | jq
```
