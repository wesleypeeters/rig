# Long Term Ideas & Considerations

Stuff that's not urgent but worth keeping track of. These are things I'll want to revisit once the core is solid.

---

## Caddy High Availability

Right now Caddy runs as a single instance. If that container goes down, all routing dies. For my current use case this is fine — I'm not running mission-critical production traffic through a single-node swarm. But eventually I should look into running Caddy as a global Swarm service replicated across manager nodes with shared config (maybe Caddy's built-in config adapter or an external store). Not a priority until I'm running multi-node clusters with uptime requirements.

---

## Port Range Limits

The port allocation scheme gives each stack 10 ports within a ~1,600–1,700 port range. That's roughly 160–170 concurrent stacks. Way more than I need right now, but it's a hard ceiling. If I ever hit it (lots of review environments stacking up, or a cluster running many small stacks), I'd need to either shrink the per-stack range or expand the port space. Also worth thinking about what happens when a single stack needs more than 10 exposed services — that's not a problem I have today but it's a design constraint to be aware of.

---

## Remote CLI Without SSH

Currently the CLI talks to Caddy's admin API via `docker exec`, which means you have to be on the swarm manager node (or SSH in). This works for CI but it means I can't run `rig deploy` or `rig exec` from my laptop against a remote cluster without an SSH tunnel.

It'd be sick to just run commands locally and have them hit a remote cluster directly. Something like `rig --cluster=dev deploy` or `rig exec --cluster=live reshark sh` without needing to SSH into a manager first. This probably means exposing a small authenticated API on the cluster side, or at minimum a smarter transport layer than `docker exec` over SSH. Big lift, but the payoff is huge — managing everything from one terminal.
