# Caddy integration

How Caddy is configured and how routing works under the hood.

## Architecture

Caddy runs as a dedicated Swarm stack deployed once per cluster. It listens on `:443`, and on `:80`, where Caddy's automatic HTTPS answers ACME HTTP challenges and redirects everything else to HTTPS. All configuration is managed through Caddy's admin API at `localhost:2019`.

The admin API is never exposed to the network. The CLI accesses it by running `curl` inside the Caddy container via `docker exec`, so it must talk to the Docker daemon of the node running Caddy.

## Port range allocation

### The problem

Caddy runs in its own stack. Application stacks run on isolated overlay networks. Caddy can't resolve service names across stack boundaries because Docker Swarm scopes overlay networks per stack.

The alternative -- a shared external overlay -- would require every service to explicitly join it, which adds boilerplate everywhere and creates a debugging trap when someone forgets the default network membership.

### The solution

The CLI allocates a range of 10 host ports per stack and publishes services on those ports. Caddy reverse proxies to `host:{port}` on the Docker host. Stack files stay clean because services don't know or care about Caddy.

Port space: `49160-65529` on clusters (1637 ranges), `45000-49149` on Docker Desktop and OrbStack (415 ranges; macOS uses `49152-65535` for ephemeral source ports).

Allocation flow:

1. CLI reads claimed port ranges from Caddy's config and picks the lowest free range ID
2. CLI claims it by adding `{"@id": <range>}` to `@vars.portRanges`. Caddy rejects a duplicate `@id`, so if a concurrent deploy claimed the same range first, the CLI picks again
3. CLI maps each routed service to a port within the range, keeping the port a service already had
4. Caddy routes are configured to upstream to `host:{port}`, and the range ID and port map are stored in the stack's route
5. Services are published on those host ports via `docker stack deploy`

A stack keeps its range across redeploys. When it is removed, or no longer has routes, the range is released for reuse.

## Config structure

```
@stacks (server srv0)
  routes[0] -> global route
    handle[0] -> @vars
      portRanges[]     -> [{ @id: 0 }, { @id: 1 }, ...]
      requestHost      -> {http.request.host}
      clusterTld       -> e.g. .dev.example.com (strip regex, public TLS allowlist)
      privateSubnet    -> optional, --private-subnet
      extraSubjectsUrl -> optional, --extra-subjects-url
    handle[1] -> strip host header handler
  localhost -> health check ("rig is running")
  {stack_id} -> one route per deployed stack
    handle[0] -> vars (repository, directory, portRangeId, portAssignments)
    handle[1] -> subroute
      routes[] -> per-hostname reverse proxy rules
```

Per-stack route:

```json
{
  "@id": "my-app",
  "handle": [
    {
      "handler": "vars",
      "repository": "owner/repo",
      "directory": "/path/to/stack/source",
      "portRangeId": 0,
      "portAssignments": { "api:3000": 0 }
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
| Route hostnames under a public cluster TLD | ACME on-demand, scoped to the deployed-host allowlist (see [below](#public-acme-is-scoped-to-the-deployed-host-allowlist)) |
| Hostnames served as-is (production) | configured by hand: a policy plus `tls.certificates.automate` |
| Wildcard public domains | configured by hand: ACME DNS-01 through the Cloudflare plugin |

The custom Caddy build includes the Cloudflare DNS plugin and the Cloudflare IP module for trusted proxy headers.

### Review environments don't get a clean wildcard

Review env hostnames built by rig follow the pattern `<route>.r<pr>.tld`, e.g. `app.r42.example.com`. That's two labels prepended to the registered domain. Public CAs only issue wildcards with one `*` at the leftmost position (CABF baseline), so a single cert can't cover all review envs at once. The options:

- **Single-level wildcard for top-level routes only.** `*.example.com` covers `app.example.com`, `api.example.com`, etc. Combine with per-hostname on-demand for the review env URLs.
- **Cloudflare Advanced Certificate Manager** (a paid add-on per zone). Issues multi-label wildcards outside the standard. Unnecessary if on-demand works for you.
- **Restructure URLs to a single label.** Instead of `app.r42.example.com`, generate `app-r42.example.com`. Then `*.example.com` covers everything. Big change to the rig route scheme.

### Switch to ZeroSSL to dodge LE rate limits

Let's Encrypt enforces 50 certificates per registered domain per 168h. On a busy review-env cluster the per-hostname on-demand path will hit this within a week. **Configure ZeroSSL as the primary ACME issuer with Let's Encrypt as fallback.** ZeroSSL's ACME rate limits are much more permissive and count separately from Let's Encrypt's.

ZeroSSL uses External Account Binding (EAB) for ACME. Get credentials once per email:

```sh
curl -sS -X POST https://api.zerossl.com/acme/eab-credentials-email \
  -d "email=you@example.com"
# returns eab_kid and eab_hmac_key
```

Then give the `@ondemand-subjects` policy an issuer with `ca: https://acme.zerossl.com/v2/DV90`, `email` and `external_account.{key_id, mac_key}`, plus a second plain `acme` issuer in the same `issuers` array to fall back to Let's Encrypt. rig's default issuer solves HTTP-01 or TLS-ALPN challenges; add a Cloudflare `dns` challenge to both issuers if you prefer DNS-01. `rig caddy init` keeps an `@ondemand-subjects` edited this way (see below).

### Public ACME is scoped to the deployed-host allowlist

Public certs are issued on-demand, but only for the hostnames rig is actually serving. The `@ondemand-subjects` policy carries an explicit `subjects` allowlist -- and an empty list means "match any SNI" in Caddy, which is the thing to avoid: on a publicly-reachable cluster, scanners spraying random SNIs would each open an ACME order and burn the issuer's rate limit on garbage hostnames.

`syncPublicSubjects` rebuilds that allowlist from the live `@stacks` routes after every deploy, teardown and `rig caddy init`, so it always tracks what's deployed. Route matchers are stored with the cluster TLD stripped, so each one is turned back into its FQDN (`<matcher><clusterTld>`, via `@vars.clusterTld`) before being allowed. A hostname not backed by a deployed route matches nothing and never opens an order. Wildcard matchers are left out: `*.x` on the list would let any name under it open an order again, so a wildcard route needs a wildcard certificate configured by hand.

- **The sentinel.** `publicAllowlistSentinel` (`_rig-public-allowlist-sentinel.localhost`) keeps the list non-empty when nothing public is deployed, so it can't collapse back to match-all. It sits under `.localhost`, so the internal policy claims it first -- it can't trigger a public order itself.
- **`automatic_https.disable_certificates` on `@stacks`.** Route matchers are TLD-stripped (`app.r33`, not `app.r33.dev.example.com`) and aren't real public names, so Caddy's managed-cert pass shouldn't try to provision for them. Public certs come from the on-demand allowlist instead.
- **The permission endpoint stays permissive by design.** It reads back the admin config and answers `200` for everything, but it's only consulted for an SNI that already matched a scoped on-demand policy, so an unknown name never reaches it. Tightening it to a real deny-by-default handler would be belt-and-suspenders.

`syncPublicSubjects` does nothing on a cluster without an `@ondemand-subjects` policy (`rig caddy init` adds it), and on a cluster whose TLD ends in `host` it keeps the list at just the sentinel, since nothing there is public. Keep `@ondemand-internal-subjects` (covers `*.localhost` and TLDs added with `rig caddy tld`) as-is; it uses the internal CA, not a public one.

## What `init` owns, and what it leaves alone

`rig caddy init` writes the whole config with one `POST /load`. On an empty cluster that is simply rig's config. On a live one, where the config also holds every deployed stack's routes and whatever people have added by hand, init starts from what is there and replaces only what rig owns:

- **Everything rig didn't author is kept**: the deployed stack routes, other servers and apps, `tls.certificates` (e.g. an `automate` list), storage, automation policies with an `@id` rig doesn't use (in the position they occupy -- order is load-bearing, since Caddy takes the first policy whose subjects match), and `@vars` keys rig doesn't set.
- **rig's own settings are kept as they are**: `@vars.portRanges`, and the `subjects` lists that `syncPublicSubjects` and `rig caddy tld` maintain. The TLD, `--private-subnet` and `--extra-subjects-url` keep their live values unless you pass them; pass `--private-subnet=` (empty) to clear one.
- **rig's own objects that someone edited are kept too, and listed.** A hand-edited `@ondemand-subjects` (say, ZeroSSL issuers) or `on_demand` permission survives a re-init. `--force` replaces them with rig's defaults.

```
$ rig caddy init .dev.example.com
Keeping 14 deployed routes
Keeping 1 automation policy rig did not create: @cloudflare
Keeping hand-edited rig settings (--force replaces them with the defaults): @ondemand-subjects.issuers
Keeping: tls.certificates
Caddy initialized with TLD .dev.example.com
```

rig's global route, its health route and its log settings are always rewritten: that is how a new rig version rolls out config changes. A default log you scoped with `include` is left alone.

## Vouching for hostnames a route matcher can't express

Some hosts are per-tenant and served by one route -- `cdn.<customer-domain>` proxied to the same backend as every other. `syncPublicSubjects` derives the allowlist from deployed route matchers, and a matcher names the backend, not the hundred hostnames that reach it, so those names never make the list and their certificates are never issued.

Dropping the `subjects` restriction to fix that is the one thing the allowlist exists to prevent. Instead, set `@vars.extraSubjectsUrl` to an endpoint returning `{"subjects": ["cdn.example.nl", ...]}`; `syncPublicSubjects` merges it into the list it already rebuilds. Entries are filtered to bare hostnames (a wildcard or a path can't reopen match-all through the back door) and capped. Every failure mode -- unreachable, non-2xx, unparseable, wrong shape -- leaves the deploy-derived list unchanged.

Set it with `rig caddy init --extra-subjects-url=<url>`. Later re-inits keep it.

## Custom build

The `caddy/Dockerfile` builds Caddy with these plugins:

- `caddy-dns/cloudflare` -- DNS-01 ACME challenges for wildcard certs
- `WeidiDeng/caddy-cloudflare-ip` -- recognizes Cloudflare proxy IPs for `X-Forwarded-For` trust
- `darkweak/souin/plugins/caddy` + `darkweak/storages/otter/caddy` -- an HTTP cache. `rig caddy init` doesn't configure it; it is built in so that a config which references it still loads.

It also includes `curl` for the admin API client. Caddy and every plugin are pinned, so rebuilding the image (`rig update`) can't change the Caddy version under a running config.

## How TLD stripping works

This is important to understand because it affects how route host matchers work.

When a request for `https://myapp.r42.dev.example.com` arrives:

1. The global vars handler captures the original host: `myapp.r42.dev.example.com`
2. The strip handler removes the cluster TLD, so the Host header becomes: `myapp.r42`
3. Per-stack subroutes match against the **stripped** host
4. The reverse proxy restores the original host from the captured variable before forwarding

This means route keys in `x-rig` should be base hostnames without the TLD. When you write `routes: { myapp: 80 }`, the matcher looks for `myapp` (after stripping). For review environments it looks for `myapp.r42`.

The strip regex is configured during `rig caddy init <tld>`:

| TLD | Strip pattern | Example |
|-----|---------------|---------|
| `.dev.example.com` | `(.+)\.dev\.example\.com$` | `myapp.r42.dev.example.com` becomes `myapp.r42` |
| Any TLD ending in `host` (`.localhost`, `.devhost`) | `(.+)\.\w*host$` | `myapp.r42.localhost` becomes `myapp.r42` |

If you change the cluster TLD, re-run `rig caddy init` with the new value.

## Private route enforcement

Routes with `access: private` are restricted to the VPN subnet configured during `rig caddy init --private-subnet=<cidr>`. The subnet value is stored in Caddy's global vars and read by the CLI when generating routes.

For each private route, two Caddy route entries are created:

1. A route matching both the hostname and `remote_ip` within the configured subnet -- proxies normally
2. A fallback route matching only the hostname -- returns `403 Forbidden: VPN required`

This means clients outside the subnet see a 403 instead of the service. If no `--private-subnet` is configured, `access: private` routes are treated like any other route (no IP restriction).

The subnet is written into each route when the stack deploys. After changing it with `rig caddy init --private-subnet=...`, redeploy every stack with private routes.

Routes with `access: none` get a single route that answers `403 Forbidden`, and their target service isn't published.

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

**Route matches wrong service or returns empty response**
- Check that your route key in `x-rig` doesn't include the TLD. It should be `myapp`, not `myapp.localhost`.
- After stripping, the Host header must match the route key. See [how TLD stripping works](#how-tld-stripping-works).

**Inspect live Caddy config**

```sh
# Get everything
docker exec <caddy-id> curl -s http://127.0.0.1:2019/config/ | jq

# Get a specific stack's routes
docker exec <caddy-id> curl -s http://127.0.0.1:2019/id/<stack-name> | jq

# Get all port range allocations
docker exec <caddy-id> curl -s http://127.0.0.1:2019/id/@vars/portRanges | jq

# Check what the strip handler is doing
docker exec <caddy-id> curl -s http://127.0.0.1:2019/id/@stacks/routes/0/handle/1 | jq
```
