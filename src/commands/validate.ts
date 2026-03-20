import parsed from "../stack/parsed.ts";
import "../stack/name.ts";
import fatalError from "../util/fatal.ts";
import type { RouteConfig, Routes, StackYml } from "../stack/types.ts";
import { optional } from "../util/env.ts";
import { ciMode } from "../constants.ts";

const hostnameRegex = /^(?!-)[a-z\d-]{1,63}(?<!-)(\.(?!-)[a-z\d-]{1,63}(?<!-))*$/;
const validAccess = new Set(["internal", "local", "private", "public"]);

function validate({ services, ["x-rig"]: { routes } }: StackYml) {
	validateRoutes(routes);
	if (!ciMode || isClusterAdmin()) return;
	for (const name in services) {
		const service = services[name];
		service.cap_add && fatalError("cap_add not allowed");
		service.ports?.length && fatalError("Admin privileges are needed to deploy stacks that expose ports on the host.\nPlease specify routes or contact a cluster admin.");
		service.volumes?.forEach(({ type }) => type === "bind" && fatalError("Host-mounted volume not allowed"));
	}
}

function isClusterAdmin() {
	const { GITHUB_ACTOR, RIG_ADMINS } = optional;
	if (!GITHUB_ACTOR || !RIG_ADMINS) return false;
	return RIG_ADMINS.split(/[\s,]+/).includes(GITHUB_ACTOR);
}

function validateHostMatcher(hostMatcher: string) {
	const stripped = hostMatcher.replace(/^(\*\.)*/, "");
	if (!hostnameRegex.test(stripped)) fatalError(`Invalid host matcher: ${JSON.stringify(hostMatcher)}`);
}

function validatePublishedRoute(route: string) {
	if (route !== "/") fatalError(`Route ${JSON.stringify(route)} is currently not supported: only "/" is allowed`);
}

function validateRouteConfig({ target, access }: RouteConfig) {
	const { protocol, hostname, pathname, username, password, search, hash } = target;
	const isValidUrl = !hostname.includes(".")
		&& pathname === "/"
		&& protocol === "http:"
		&& username + password + search + hash === "";
	if (!isValidUrl) fatalError(`Target ${JSON.stringify(target)} currently not supported`);
	if (!validAccess.has(access)) fatalError(`Access level ${JSON.stringify(access)} currently not supported`);
}

function validateRoutes(routes: Routes) {
	Object.entries(routes).forEach(([hosts, hostRoutes]) => {
		hosts.split(" ").forEach(validateHostMatcher);
		Object.keys(hostRoutes).forEach(validatePublishedRoute);
		Object.values(hostRoutes).forEach(validateRouteConfig);
	});
}

validate(parsed);
