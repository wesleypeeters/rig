const usage = `
rig - Docker Swarm deployment orchestrator

USAGE
  rig <command> [options]

COMMANDS
  deploy [await]       Deploy stack to swarm + configure caddy routes
  rm [await]           Remove stack from swarm + caddy
  build                Build images via docker buildx bake + lock digests
  config               Output merged, interpolated stack YAML
  validate             Validate stack against governance rules
  show                 Interactive overview of running services
  debug <service>      Shell into a running service container
  exec <service> ...   Execute command in service container
  cleanup              Remove stale review environments
  rollback             Redeploy using a previous digest lockfile
  caddy init [tld]     Initialize Caddy's base configuration
  caddy trust          Install Caddy's root CA certificate locally
  caddy tld <name>     Register a custom TLD wildcard
  caddy log <level>    Set Caddy's log level
`;

console.log(usage.trim());
if (Deno.args[0] !== "usage" && Deno.args[0] !== undefined) Deno.exit(1);
