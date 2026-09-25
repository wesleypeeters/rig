/**
 * What `rig caddy init` owns, and what it must leave alone.
 *
 * THE PROBLEM THIS SOLVES. `init` writes the whole config with a single
 * `POST /load`, which is correct on an empty cluster and destructive on a live
 * one. Caddy config is shared with humans and with every deployed stack: it
 * holds the stacks' routes and port-range claims, TLS automation policies for
 * names rig never hears about, certificates managed with `automate`, DNS-01
 * issuers rig's defaults do not include, and `@vars` keys set by hand. A load
 * built only from rig's defaults drops all of it, and nothing says so until
 * routes 404 or certificates stop renewing.
 *
 * So init starts from the live config and replaces only what rig owns:
 *
 *  - Everything rig did not author is PRESERVED: stack routes, other servers,
 *    other apps, `tls.certificates`, storage, foreign policies (in the position
 *    they already occupy) and foreign `@vars` keys.
 *  - Rig's own objects that someone has CHANGED are KEPT as they are and named
 *    in the output. rig has an opinion about them, but a human's edit to a live
 *    cluster outranks a default. `--force` replaces them with the defaults.
 *  - Fields rig rewrites at runtime (a policy's `subjects`) are carried over,
 *    not reset: `syncPublicSubjects` and `rig caddy tld` maintain them.
 */

/** Automation policies `init` authors. Anything else on the cluster is foreign. */
export const RIG_POLICY_IDS = [
	"@ondemand-internal-subjects",
	"@internal-subjects",
	"@ondemand-subjects"
];

/**
 * Fields rig itself rewrites AFTER init, so a difference is expected and means
 * nothing. Comparing these would make every established cluster look edited;
 * resetting them would drop registered TLDs and the public allowlist.
 */
const RUNTIME_MUTATED_POLICY_FIELDS = ["subjects"];

/** `@vars` keys init authors; any other key on the cluster was put there by someone else. */
export const RIG_VARS_KEYS = [
	"@id",
	"handler",
	"requestHost",
	"portRanges",
	"clusterTld",
	"privateSubnet",
	"extraSubjectsUrl"
];

type Policy = Record<string, unknown> & { "@id"?: string };

const idOf = (o: any) => String(o?.["@id"] ?? "");
/** Deep equality that ignores key order: Caddy hands config back with keys sorted. */
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]));
	}
	return value;
}

/** Policies rig did not author, in the order the cluster already has them. */
export function foreignPolicies(existing: Policy[]): Policy[] {
	return existing.filter(p => !RIG_POLICY_IDS.includes(idOf(p)));
}

/**
 * Rig-owned policies a human has edited, as `<@id>.<field>` entries.
 *
 * Compares only what rig actually decides — issuers, the on-demand flag — and
 * skips what it rewrites at runtime. A cluster nobody has touched returns [].
 */
export function customisedRigPolicies(existing: Policy[], desired: Policy[]): string[] {
	const changes: string[] = [];

	for (const want of desired) {
		const id = idOf(want);
		if (!RIG_POLICY_IDS.includes(id)) continue;

		const have = existing.find(p => idOf(p) === id);
		if (!have) continue; // Absent, not edited — init will simply create it.

		for (const key of Object.keys({ ...have, ...want })) {
			if (key === "@id" || RUNTIME_MUTATED_POLICY_FIELDS.includes(key)) continue;
			if (!same(have[key], want[key])) changes.push(`${id}.${key}`);
		}
	}

	return changes;
}

/**
 * Merge rig's policies into the cluster's list WITHOUT reordering it.
 *
 * Order is load-bearing — Caddy takes the first policy whose subjects match, so
 * moving a foreign policy above `@ondemand-subjects` would quietly change which
 * issuer serves a name. Rig-owned entries are replaced where they already sit,
 * keeping their runtime-maintained fields; ids in `keep` are left untouched;
 * only genuinely new ones are appended.
 */
export function mergePolicies(existing: Policy[], desired: Policy[], keep: Iterable<string> = []): Policy[] {
	const kept = new Set(keep);
	const desiredById = new Map(desired.map(p => [idOf(p), p]));

	const merged = existing.map(p => {
		const id = idOf(p);
		const replacement = desiredById.get(id);
		if (!replacement) return p;
		desiredById.delete(id);
		if (kept.has(id)) return p;
		const carried = Object.fromEntries(RUNTIME_MUTATED_POLICY_FIELDS.filter(f => f in p).map(f => [f, p[f]]));
		return { ...replacement, ...carried };
	});

	return [...merged, ...desiredById.values()];
}

/** `@vars` entries someone added that rig would otherwise drop. */
export function foreignVars(existing: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(existing ?? {}).filter(([key]) => !RIG_VARS_KEYS.includes(key))
	);
}

/** The `@vars` handler, wherever it sits in the `@stacks` route tree. */
export function findVars(cfg: any): Record<string, unknown> {
	for (const route of cfg?.apps?.http?.servers?.srv0?.routes ?? []) {
		const vars = globalVarsOf(route);
		if (vars) return vars;
	}
	return {};
}

function globalVarsOf(route: any): Record<string, unknown> | undefined {
	return (route?.handle ?? []).find((h: any) => idOf(h) === "@vars");
}

/**
 * The route list of `@stacks`: rig's global route and health route replaced in
 * place, every stack route (and anything else) kept where it is.
 */
function mergeRoutes(existing: any[], [wantGlobal, wantLocalhost]: any[]): any[] {
	let sawGlobal = false;
	let sawLocalhost = false;
	const routes: any[] = [];

	for (const route of existing) {
		const vars = globalVarsOf(route);
		if (vars) {
			sawGlobal = true;
			routes.push({
				...wantGlobal,
				handle: wantGlobal.handle.map((h: any) => idOf(h) === "@vars" ? { ...h, ...foreignVars(vars) } : h)
			});
		} else if (idOf(route) === "localhost") {
			sawLocalhost = true;
			routes.push(wantLocalhost);
		} else if (isEmptyWildcardsRoute(route)) {
			// An older init created this placeholder; it never matched anything.
		} else {
			routes.push(route);
		}
	}

	if (!sawGlobal) routes.unshift(wantGlobal);
	if (!sawLocalhost) routes.push(wantLocalhost);
	return routes;
}

function isEmptyWildcardsRoute(route: any) {
	const [matcher, ...more] = route?.match ?? [];
	return idOf(matcher) === "@wildcards"
		&& !more.length
		&& !matcher.host?.length
		&& !route.handle?.length;
}

function mergeDefaultLog(have: any, want: any) {
	if (!have) return want;
	const log = { ...have, "@id": want["@id"] };
	// A hand-set `include` scopes the log on purpose; leave it be.
	if (!log.include) log.exclude = [...new Set([...(log.exclude ?? []), ...want.exclude])];
	return log;
}

/**
 * Lay rig's desired config over the live one. Returns the config to load and
 * a line for each thing worth telling the operator about.
 */
export function reconcileConfig(existing: any, desired: any, force = false): { config: any; notes: string[] } {
	const config = structuredClone(existing ?? {});
	const notes: string[] = [];

	const logs = ((config.logging ??= {}).logs ??= {});
	logs.default = mergeDefaultLog(logs.default, desired.logging.logs.default);
	logs.access = desired.logging.logs.access;

	const apps = (config.apps ??= {});
	const servers = ((apps.http ??= {}).servers ??= {});
	const wantServer = desired.apps.http.servers.srv0;
	const haveRoutes: any[] = servers.srv0?.routes ?? [];
	servers.srv0 = { ...servers.srv0, ...wantServer, routes: mergeRoutes(haveRoutes, wantServer.routes) };

	const stackRoutes = servers.srv0.routes.length - wantServer.routes.length;
	if (stackRoutes > 0) notes.push(`Keeping ${stackRoutes} deployed route${stackRoutes === 1 ? "" : "s"}`);

	const carriedVars = Object.keys(foreignVars(findVars(existing)));
	if (carriedVars.length) notes.push(`Keeping @vars set outside rig: ${carriedVars.join(", ")}`);

	const automation = ((apps.tls ??= {}).automation ??= {});
	const wantAutomation = desired.apps.tls.automation;
	const havePolicies: Policy[] = automation.policies ?? [];
	const customised = customisedRigPolicies(havePolicies, wantAutomation.policies);
	const keep = force ? [] : customised.map(c => c.slice(0, c.lastIndexOf(".")));

	const foreign = foreignPolicies(havePolicies);
	if (foreign.length) {
		notes.push(`Keeping ${foreign.length} automation polic${foreign.length === 1 ? "y" : "ies"} rig did not create: ${foreign.map(idOf).join(", ")}`);
	}
	automation.policies = mergePolicies(havePolicies, wantAutomation.policies, keep);

	const onDemandCustomised = automation.on_demand !== undefined && !same(automation.on_demand, wantAutomation.on_demand);
	if (onDemandCustomised) customised.push("tls.automation.on_demand");
	if (force || !onDemandCustomised) automation.on_demand = wantAutomation.on_demand;

	if (customised.length) {
		notes.push(force
			? `--force: replacing hand-edited rig settings with the defaults: ${customised.join(", ")}`
			: `Keeping hand-edited rig settings (--force replaces them with the defaults): ${customised.join(", ")}`);
	}

	const preserved = [
		...Object.keys(config).filter(k => k !== "logging" && k !== "apps"),
		...Object.keys(apps).filter(k => k !== "http" && k !== "tls").map(k => `apps.${k}`),
		...Object.keys(servers).filter(k => k !== "srv0").map(k => `servers.${k}`),
		...Object.keys(apps.tls).filter(k => k !== "automation").map(k => `tls.${k}`)
	];
	if (preserved.length) notes.push(`Keeping: ${preserved.join(", ")}`);

	return { config, notes };
}
