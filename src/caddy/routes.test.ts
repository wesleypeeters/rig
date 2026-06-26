import { assertEquals } from "@std/assert";
import type { Access, RouteConfig } from "../stack/types.ts";
import { createCaddyStackConfig } from "./routes.ts";

function route(access: Access, upstream = "api:3000"): RouteConfig {
	return { access, csp: "optional", target: new URL(`http://${upstream}`) };
}

Deno.test("builds a vars handler and a single proxy route for a public host", () => {
	const routes = { "app.example.com": { "/": route("public") } };
	const config: any = createCaddyStackConfig("mystack", routes, 5, { prNumber: null });

	assertEquals(config["@id"], "mystack");
	assertEquals(config.handle[0].handler, "vars");
	assertEquals(config.handle[0].portRangeId, 5);

	const subroute = config.handle[1];
	assertEquals(subroute.handler, "subroute");
	assertEquals(subroute.routes.length, 1);

	const r = subroute.routes[0];
	assertEquals(r.match, [{ host: ["app.example.com"] }]);
	assertEquals(r.terminal, true);
	assertEquals(r.handle[0].handler, "reverse_proxy");
	assertEquals(r.handle[0].upstreams, [{ dial: "api:3000" }]);
	assertEquals(r.handle[0].headers.request.set.Host, ["{http.vars.requestHost}"]);
});

Deno.test("suffixes hosts with the PR number in a review environment", () => {
	const routes = { "app.example.com": { "/": route("public") } };
	const config: any = createCaddyStackConfig("mystack", routes, 0, { prNumber: 42 });
	assertEquals(config.handle[1].routes[0].match, [{ host: ["app.example.com.r42"] }]);
});

Deno.test("splits space-separated host groups", () => {
	const routes = { "a.com b.com": { "/": route("public") } };
	const config: any = createCaddyStackConfig("s", routes, 0, { prNumber: null });
	assertEquals(config.handle[1].routes[0].match[0].host, ["a.com", "b.com"]);
});

Deno.test("a private route emits a VPN matcher plus a 403 fallback", () => {
	const routes = { "secret.example.com": { "/": route("private") } };
	const config: any = createCaddyStackConfig("s", routes, 0, { privateSubnet: ["10.0.0.0/8"], prNumber: null });

	const subRoutes = config.handle[1].routes;
	assertEquals(subRoutes.length, 2);
	assertEquals(subRoutes[0].match, [{ host: ["secret.example.com"], remote_ip: { ranges: ["10.0.0.0/8"] } }]);
	assertEquals(subRoutes[0].terminal, true);
	assertEquals(subRoutes[1].handle, [{ handler: "static_response", status_code: "403", body: "Forbidden: VPN required" }]);
	assertEquals(subRoutes[1].match, [{ host: ["secret.example.com"] }]);
});

Deno.test("a private route with no configured subnet falls back to a single open route", () => {
	// Documents current behavior: without a privateSubnet, `access: private`
	// gets no IP restriction -- it becomes an ordinary route.
	const routes = { "secret.example.com": { "/": route("private") } };
	const config: any = createCaddyStackConfig("s", routes, 0, { prNumber: null });
	assertEquals(config.handle[1].routes.length, 1);
	assertEquals(config.handle[1].routes[0].match, [{ host: ["secret.example.com"] }]);
});

Deno.test("emits only the vars handler when there are no routes", () => {
	const config: any = createCaddyStackConfig("s", {}, 3, { prNumber: null });
	assertEquals(config.handle.length, 1);
	assertEquals(config.handle[0].handler, "vars");
});
