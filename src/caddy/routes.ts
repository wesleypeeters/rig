import type { Routes } from "../stack/types.ts";
import { prNumber } from "../github/pr.ts";
import { optional } from "../util/env.ts";

export function createCaddyStackConfig(stackId: string, routes: Routes, portRangeId: number) {
	const caddyRoutes: any[] = Object.entries(routes).map(([hosts, subroutes]) => {
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
		return {
			handle,
			match: [{ host: prNumber ? hostMatchers.map(h => `${h}.r${prNumber}`) : hostMatchers }],
			terminal: true
		};
	});
	return {
		"@id": stackId,
		handle: [
			{
				handler: "vars",
				repository: optional.GITHUB_REPOSITORY || null,
				portRangeId
			},
			...caddyRoutes.length ? [{
				handler: "subroute",
				routes: caddyRoutes
			}] : []
		]
	};
}
