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

	await caddyApiFetch("patch", "@ondemand-subjects/subjects", [...subjects]);
}
