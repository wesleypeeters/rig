import type { Routes } from "../stack/types.ts";
import { prNumber } from "../github/pr.ts";
import { optional } from "../util/env.ts";
import caddyApiFetch from "./api.ts";
import id from "../stack/id.ts";

const vars = id === "caddy" ? {} : (await caddyApiFetch("get", "@vars") || {});
const privateSubnet: string[] | undefined = vars.privateSubnet?.split(",");

export function createCaddyStackConfig(stackId: string, routes: Routes, portRangeId: number) {
	const caddyRoutes: any[] = Object.entries(routes).flatMap(([hosts, subroutes]) => {
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
				portRangeId
			},
			...caddyRoutes.length ? [{
				handler: "subroute",
				routes: caddyRoutes
			}] : []
		]
	};
}
