# Long-term Ideas

Things that aren't priorities right now but would be sick to have eventually.

---

## Remote CLI (no SSH)

Right now the CLI talks to Caddy's admin API via `docker exec`, which means you need to be on a manager node or SSH into one. This works fine for CI but it means I can't just run `rig deploy` or `rig exec reshark bash` from my laptop targeting a remote cluster.

The dream: expose a secure API (mTLS or token-based) on each cluster that the CLI can talk to directly. Then `rig deploy --cluster=dev` just works from anywhere. Same for `rig exec`, `rig rollback`, `rig show` — full cluster control from my local machine without opening an SSH session.

This would need:
- An API gateway or agent running on the cluster that proxies CLI commands
- Auth that isn't a nightmare (mTLS with client certs, or a token issued per-developer)
- The CLI to support both local (docker exec) and remote (HTTPS) transport for Caddy operations

Not urgent. SSH works. But this would make the developer experience significantly better.

---

## Caddy High Availability

Caddy currently runs as a single container. If it goes down, all routing stops. For now this is fine — Swarm restarts it quickly and the downtime window is small.

Eventually it'd be worth running Caddy as a global Swarm service replicated across manager nodes with shared config (or config sync). This gets complicated fast though — Caddy's admin API is per-instance, so you'd need some kind of config replication or a shared storage backend.

Not a problem until it is. Revisit when uptime requirements get serious.

---

## Port Range Limits

The current port allocation gives each stack 10 ports within a range of ~1,600-1,700 available ports. That's ~160-170 concurrent stacks. More than enough for now.

Two things to keep in mind:
- If a stack ever needs more than 10 exposed services, the fixed range size becomes a problem. Could make range size configurable per stack.
- If we ever hit the concurrent stack limit (unlikely but possible with lots of review environments on a busy repo), we'd need to either expand the port range or implement smarter allocation (variable-size ranges, compaction, etc).

Not a real concern today. 