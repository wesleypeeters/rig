import type { Routes } from "../stack/types.ts";
import { optional } from "../util/env.ts";

export type CaddyStackConfigDeps = {
	// VPN subnet ranges that gate `access: private` routes. When undefined (no
	// subnet configured on the cluster) private routes get no IP restriction.
	privateSubnet?: string[];
	// Review-environment PR number; when set, route hosts are suffixed with .r<n>.
	prNumber: number | null;
};

export function createCaddyStackConfig(stackId: string, routes: Routes, portRangeId: number, { privateSubnet, prNumber }: CaddyStackConfigDeps) {
	const caddyRoutes: any[] = Object.entries(routes).flatMap(([hosts, subroutes]): any[] => {
		const isPrivate = privateSubnet && Object.values(subroutes).some(r => r.access === "private");
		const handle = Object.entries(subroutes).map(([_path, { target }]) => {
			const hostHeader = ["{http.vars.requestHost}"];
			return {
				handler: "reverse_proxy",
				headers: {
					request: {
						set: {
							"Host": hostHeader,
							"X-Forwarded-Host": hostHeader
						}
					}
				},
				upstreams: [{ dial: target.host }]
			};
		});
		const hostMatchers = hosts.split(/\s+/);
		const matchedHosts = prNumber ? hostMatchers.map(h => `${h}.r${prNumber}`) : hostMatchers;

		if (isPrivate) {
			return [
				{
					handle,
					match: [{ host: matchedHosts, remote_ip: { ranges: privateSubnet } }],
					terminal: true
				},
				{
					handle: [{ handler: "static_response", status_code: "403", body: "Forbidden: VPN required" }],
					match: [{ host: matchedHosts }],
					terminal: true
				}
			];
		}

		return [{
			handle,
			match: [{ host: matchedHosts }],
			terminal: true
		}];
	});
	return {
		"@id": stackId,
		handle: [
			{
				handler: "vars",
				repository: optional.GITHUB_REPOSITORY || null,
				directory: Deno.cwd(),
				portRangeId
			},
			...caddyRoutes.length ? [{
				handler: "subroute",
				routes: caddyRoutes
			}] : []
		]
	};
}
