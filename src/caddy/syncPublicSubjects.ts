import caddyApiFetch from "./api.ts";
import { publicAllowlistSentinel } from "./tls.ts";

/**
 * Rebuild the public on-demand ACME allowlist from the stacks Caddy currently
 * serves. Route matchers are stored with the cluster TLD stripped, so each
 * matched host is turned back into its FQDN (host + clusterTld) before being
 * allowed. Anything not backed by a deployed route, e.g. a scanner spraying
 * random SNIs, matches nothing and never opens an ACME order.
 *
 * Called after every deploy and teardown so the list tracks what is live.
 */
export default async function syncPublicSubjects() {
	// Skip on clusters not yet re-inited with the scoped policy.
	if (!(await caddyApiFetch("get", "@ondemand-subjects"))) return;

	const vars = await caddyApiFetch("get", "@vars");
	const clusterTld: string | undefined = vars?.clusterTld;

	// Nothing public to allowlist on a .localhost / internal-TLD cluster.
	if (!clusterTld || clusterTld.endsWith("host")) {
		await caddyApiFetch("patch", "@ondemand-subjects/subjects", [publicAllowlistSentinel]);
		return;
	}

	const server = await caddyApiFetch("get", "@stacks");
	const subjects = new Set<string>([publicAllowlistSentinel]);
	for (const route of server?.routes ?? []) {
		for (const handler of route.handle ?? []) {
			if (handler.handler !== "subroute") continue;
			for (const sub of handler.routes ?? []) {
				for (const matcher of sub.match ?? []) {
					for (const host of matcher.host ?? []) subjects.add(`${host}${clusterTld}`);
				}
			}
		}
	}

	for (const extra of await fetchExtraSubjects(vars?.extraSubjectsUrl)) subjects.add(extra);

	await caddyApiFetch("patch", "@ondemand-subjects/subjects", [...subjects]);
}

/**
 * Names an application on this cluster vouches for, which rig cannot infer from
 * a route matcher.
 *
 * Some hosts are per-tenant and served by ONE route: a `cdn.<customer-domain>`
 * proxied to the same backend as every other. The route matcher names the
 * backend, not the hundred hostnames that reach it, so a deploy-derived list
 * misses them and the certificate is never issued.
 *
 * This does NOT loosen the allowlist — that distinction is the whole point.
 * Dropping the subjects restriction instead would let the policy match every
 * SNI again, which is what exhausted the ACME account's new-orders limit and
 * starved review environments of certificates. The list stays explicit and
 * finite; it just gains entries something authoritative asked for.
 *
 * Failure is non-fatal and non-destructive: an unreachable or malformed
 * endpoint means the deploy-derived list is used unchanged, never an empty one.
 * With no `extraSubjectsUrl` configured this is inert, so clusters that do not
 * use it behave exactly as before.
 *
 * The URL is read from `@vars`, which a deploy only ever READS — so it can be
 * seeded once through the admin API and survives every subsequent deploy. That
 * matters: `rig caddy init` is the only thing that rewrites `@vars`, and on a
 * cluster with hand-added automation policies re-initing would discard them.
 */
export async function fetchExtraSubjects(url: unknown): Promise<string[]> {
	if (typeof url !== "string" || !url.startsWith("https://")) return [];

	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(10_000),
			headers: { accept: "application/json" }
		});
		if (!response.ok) return [];

		const body = await response.json();
		const subjects: unknown = body?.subjects;
		if (!Array.isArray(subjects)) return [];

		return subjects
			// A hostname, nothing else. An entry containing a wildcard or a path
			// would be a way to widen the policy through the back door.
			.filter((s): s is string => typeof s === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s))
			.slice(0, 2000);
	} catch {
		return [];
	}
}
