import type { StackYml, RouteConfig, Routes } from "./types.ts";
import config from "./config.ts";
import { parse as parseYaml } from "@std/yaml";
import ymlFiles from "./ymlFiles.ts";
import fatalError from "../util/fatal.ts";
const { keys, values, entries } = Object;

function normalizeRoutes(routes: Routes) {
	const defaults: Omit<RouteConfig, "target"> = { access: "internal", csp: "optional" };
	entries(routes).forEach(([hosts, value]) => {
		const [primaryHost] = hosts.split(/\.| /, 1);
		if (value && typeof value === "object") {
			entries(value).forEach(([route, routeConfig]) => {
				if (routeConfig === null || typeof routeConfig !== "object") routeConfig = { target: routeConfig } as unknown as RouteConfig;
				routeConfig.target = createTargetUrl(routeConfig.target as any || "", primaryHost);
				routes[hosts][route] = { ...defaults, ...routeConfig };
			});
		}
		else routes[hosts] = { "/": { ...defaults, target: createTargetUrl(value as any, primaryHost) } };
	});
}

function createTargetUrl(route: string | number | null, host: string) {
	route = route === null || route === ""
		? host
		: typeof route === "number"
			? `${host}:${route}`
			: typeof route === "string"
				? (route[0] === ":" || route[0] === "/" ? host : "") + route
				: fatalError("Error parsing route")!;
	return new URL(`http://${route}`);
}

const parsed = parseYaml(await config(ymlFiles)) as StackYml;
// `docker stack config` strips x-* extensions from every file after the
// first, so x-rig config declared in an overlay (e.g. a mailpit route in
// local.stack.yml) never survives the merge. Re-merge x-rig from the raw
// input files ourselves: later files win per key, routes merge per host.
// Note: overlay x-rig values skip docker's env interpolation — keep them
// literal.
for (const file of ymlFiles.slice(1)) {
	const doc = parseYaml(await Deno.readTextFile(file)) as StackYml | null;
	const ext = doc?.["x-rig"];
	if (!ext) continue;
	parsed["x-rig"] = {
		...(parsed["x-rig"] ?? {}),
		...ext,
		routes: { ...(parsed["x-rig"]?.routes ?? {}), ...(ext.routes ?? {}) }
	} as StackYml["x-rig"];
}
keys(parsed.services).some(s => s.includes(".")) && fatalError("Using '.' character in service name not allowed.");
values(parsed.services).filter(s => s.environment).forEach(({ environment }) => {
	entries(environment!).forEach(([key, value]) => (value === null) && delete environment![key]);
});
const ext = parsed["x-rig"] ??= {} as StackYml["x-rig"];
ext.routes ? normalizeRoutes(ext.routes) : ext.routes = {};
export default parsed;
