const usage = `
rig - Docker Swarm deployment orchestrator

USAGE
  rig <command> [options]

COMMANDS
  deploy [await]       Deploy stack to swarm + configure caddy routes
  rm [await]           Remove stack from swarm + caddy
  build                Build images via docker buildx bake + lock digests
  config               Output merged, interpolated stack YAML
  json                 Output merged stack config as JSON
  validate             Validate stack against governance rules
  show                 Interactive overview of running services
  debug <service>      Shell into a running service container (docker debug)
  exec <service> ...   Execute command in service container
  run <service> ...    Run a fresh container from a service image (cwd mounted and used at /project)
  cleanup [--max-age=<48h|2d>]
                       Remove review environments whose PR closed or that are older than max-age
  rollback [--list | --to=<entry>]
                       Restore an earlier lockfile of this environment (then run deploy)
  update               Pull latest rig, reinstall, rebuild and redeploy caddy
  network <name>       Create a swarm-scoped overlay network
  dir <stack>          Print the source directory recorded for a deployed stack
  caddy init [<tld>] [--private-subnet=<cidr,...>] [--extra-subjects-url=<url>] [--force]
                       Initialize Caddy, or reconcile a running Caddy with rig's config
  caddy trust          Install Caddy's root CA certificate locally
  caddy tld <name>     Add internal-CA certificates for a private TLD
  caddy log <level>    Set Caddy's log level (DEBUG, INFO, WARN, ERROR)
`;

console.log(usage.trim());
if (Deno.args[0] !== "usage" && Deno.args[0] !== undefined) Deno.exit(1);
