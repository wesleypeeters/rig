import caddyFetch from "./fetch.ts";
import buildBaseConfig from "./baseConfig.ts";
import { findVars, reconcileConfig } from "./ownership.ts";
import syncPublicSubjects from "./syncPublicSubjects.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

const args = Deno.args.slice(2);

/** `--name=value` → value, bare `--name` or `--name=` → "", absent → undefined. */
function flag(name: string): string | undefined {
	const arg = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
	return arg === undefined ? undefined : arg.slice(name.length + 3);
}

const tldArg = args.find(a => !a.startsWith("--"));
if (tldArg !== undefined && !/^\.[a-z\d-]+(\.[a-z\d-]+)*$/i.test(tldArg)) {
	fatalError(`Invalid cluster TLD ${JSON.stringify(tldArg)}: expected a leading dot, e.g. .localhost or .dev.example.com`);
}

// `POST /load` replaces the ENTIRE config, which is right on an empty cluster
// and destructive on a live one. Read what is there first and reconcile against
// it; see ownership.ts for what is kept.
const existingResponse = await caddyFetch("get", "config/");
let existingConfig: any = null;
try {
	existingConfig = existingResponse.ok ? JSON.parse(existingResponse.body || "null") : null;
} catch {
	existingConfig = null;
}

// Anything not passed on the command line keeps its live value, so a re-init
// can't silently reset the TLD, open up private routes by dropping the subnet,
// or free port ranges that running stacks still hold. An explicit empty flag
// (`--private-subnet=`) clears the value.
const liveVars: Record<string, any> = findVars(existingConfig);
const clusterTld: string = tldArg ?? liveVars.clusterTld ?? ".localhost";
const privateSubnet: string | undefined = flag("private-subnet") ?? liveVars.privateSubnet;
// An application on this cluster can vouch for hostnames rig cannot infer from
// a route matcher — a per-customer `cdn.<domain>` served by one shared route,
// for instance. See syncPublicSubjects: the list stays explicit either way.
const extraSubjectsUrl: string | undefined = flag("extra-subjects-url") ?? liveVars.extraSubjectsUrl;

const desired = buildBaseConfig({
	clusterTld,
	privateSubnet: privateSubnet || undefined,
	extraSubjectsUrl: extraSubjectsUrl || undefined,
	portRanges: Array.isArray(liveVars.portRanges) ? liveVars.portRanges : [],
	hostname: Deno.hostname()
});

const { config, notes } = reconcileConfig(existingConfig, desired, flag("force") !== undefined);
notes.forEach(info);

const response = await caddyFetch("post", "load", JSON.stringify(config));
response.ok || fatalError(JSON.parse(response.body || "{}").error ?? `Caddy answered ${response.status}`);

// The allowlist was carried over as it was; rebuild it for the (possibly new) TLD.
await syncPublicSubjects();
info(`Caddy initialized with TLD ${clusterTld}${privateSubnet ? ` (private subnet: ${privateSubnet})` : ""}`);
