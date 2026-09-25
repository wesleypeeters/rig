import { assertEquals, assert } from "@std/assert";
import buildBaseConfig from "./baseConfig.ts";
import { findVars, reconcileConfig } from "./ownership.ts";

/**
 * `rig caddy init` on a cluster that is already serving. The live shape below
 * is what a real cluster accumulates: deployed stack routes and their port
 * ranges, hand-added policies and proactively managed certificates, a
 * customised rig policy, and @vars keys nobody told rig about.
 */

const desired = () => buildBaseConfig({
	clusterTld: ".example.live",
	privateSubnet: "10.8.0.0/24",
	portRanges: [{ "@id": 0 }, { "@id": 7 }],
	hostname: "manager-1"
});

function liveCluster(): any {
	const base: any = desired();
	const [globalRoute, localhostRoute] = base.apps.http.servers.srv0.routes;
	globalRoute.handle[0].handRolled = "keep me";
	return {
		admin: { listen: "localhost:2019" },
		storage: { module: "file_system", root: "/data" },
		logging: { logs: { default: { "@id": "@log", level: "WARN" } } },
		apps: {
			http: {
				servers: {
					srv0: {
						...base.apps.http.servers.srv0,
						routes: [
							globalRoute,
							{ match: [{ "@id": "@wildcards", host: [] }] },
							localhostRoute,
							{ "@id": "shop", handle: [{ handler: "vars", portRangeId: 0 }] },
							{ "@id": "shop_r12", handle: [{ handler: "vars", portRangeId: 7 }] }
						]
					},
					metrics: { listen: [":9180"] }
				}
			},
			tls: {
				certificates: { automate: ["*.example.live", "app.example.io"] },
				automation: {
					...base.apps.tls.automation,
					policies: [
						{ ...base.apps.tls.automation.policies[0], subjects: ["*.localhost", "*.devhost"] },
						base.apps.tls.automation.policies[1],
						{
							"@id": "@ondemand-subjects",
							issuers: [{ module: "acme", ca: "https://acme.zerossl.com/v2/DV90" }, { module: "acme" }],
							on_demand: true,
							subjects: ["shop.example.live"]
						},
						{ "@id": "@example-io", issuers: [{ module: "acme" }], subjects: ["app.example.io"] }
					]
				}
			},
			layer4: { servers: {} }
		}
	};
}

const routeIds = (config: any) => config.apps.http.servers.srv0.routes.map((r: any) => r["@id"] ?? r.match?.[0]?.["@id"] ?? "(global)");
const policy = (config: any, id: string) => config.apps.tls.automation.policies.find((p: any) => p["@id"] === id);

Deno.test("a fresh cluster gets exactly rig's config", () => {
	assertEquals(reconcileConfig(null, desired()).config, desired());
	assertEquals(reconcileConfig({}, desired()).config, desired());
});

Deno.test("deployed stack routes survive, in place, after rig's own routes", () => {
	const { config } = reconcileConfig(liveCluster(), desired());
	assertEquals(routeIds(config), ["(global)", "localhost", "shop", "shop_r12"]);
});

Deno.test("port ranges and private subnet come from the desired vars, foreign vars are kept", () => {
	const vars = findVars(reconcileConfig(liveCluster(), desired()).config);
	assertEquals(vars.portRanges, [{ "@id": 0 }, { "@id": 7 }]);
	assertEquals(vars.privateSubnet, "10.8.0.0/24");
	assertEquals(vars.handRolled, "keep me");
});

Deno.test("everything rig does not author is kept", () => {
	const live = liveCluster();
	const { config, notes } = reconcileConfig(live, desired());
	assertEquals(config.storage, live.storage);
	assertEquals(config.admin, live.admin);
	assertEquals(config.apps.layer4, live.apps.layer4);
	assertEquals(config.apps.http.servers.metrics, live.apps.http.servers.metrics);
	assertEquals(config.apps.tls.certificates, live.apps.tls.certificates);
	assertEquals(policy(config, "@example-io"), policy(live, "@example-io"));
	assert(notes.some(n => n.includes("tls.certificates")));
});

Deno.test("a customised rig policy is kept as it is and reported", () => {
	const live = liveCluster();
	const { config, notes } = reconcileConfig(live, desired());
	assertEquals(policy(config, "@ondemand-subjects"), policy(live, "@ondemand-subjects"));
	assert(notes.some(n => n.includes("@ondemand-subjects.issuers") && n.includes("--force")));
});

Deno.test("--force replaces a customised rig policy but keeps its allowlist", () => {
	const { config } = reconcileConfig(liveCluster(), desired(), true);
	const ondemand = policy(config, "@ondemand-subjects");
	assertEquals(ondemand.issuers, [{ module: "acme" }]);
	assertEquals(ondemand.subjects, ["shop.example.live"]);
});

Deno.test("registered private TLDs survive a re-init", () => {
	const { config } = reconcileConfig(liveCluster(), desired());
	assertEquals(policy(config, "@ondemand-internal-subjects").subjects, ["*.localhost", "*.devhost"]);
});

Deno.test("policy order is untouched", () => {
	const { config } = reconcileConfig(liveCluster(), desired());
	assertEquals(config.apps.tls.automation.policies.map((p: any) => p["@id"]), [
		"@ondemand-internal-subjects",
		"@internal-subjects",
		"@ondemand-subjects",
		"@example-io"
	]);
});

Deno.test("a hand-tuned on-demand permission is kept unless forced", () => {
	const live = liveCluster();
	live.apps.tls.automation.on_demand = { permission: { module: "http", endpoint: "https://check.example.io" } };
	assertEquals(reconcileConfig(live, desired()).config.apps.tls.automation.on_demand, live.apps.tls.automation.on_demand);
	assertEquals(reconcileConfig(live, desired(), true).config.apps.tls.automation.on_demand, desired().apps.tls.automation.on_demand);
});

Deno.test("the default log keeps its level and stops duplicating access lines", () => {
	const { config } = reconcileConfig(liveCluster(), desired());
	assertEquals(config.logging.logs.default, { "@id": "@log", level: "WARN", exclude: ["http.log.access"] });
	assertEquals(config.logging.logs.access, desired().logging.logs.access);
});

Deno.test("a default log scoped with include is left alone", () => {
	const live = liveCluster();
	live.logging.logs.default = { "@id": "@log", include: ["http"] };
	assertEquals(reconcileConfig(live, desired()).config.logging.logs.default, { "@id": "@log", include: ["http"] });
});

Deno.test("a @wildcards route someone put to use is kept", () => {
	const live = liveCluster();
	live.apps.http.servers.srv0.routes[1] = { match: [{ "@id": "@wildcards", host: ["x"] }], handle: [{ handler: "static_response" }] };
	assertEquals(routeIds(reconcileConfig(live, desired()).config), ["(global)", "@wildcards", "localhost", "shop", "shop_r12"]);
});

Deno.test("a cluster missing rig's global route gets it first", () => {
	const live = liveCluster();
	live.apps.http.servers.srv0.routes.shift();
	assertEquals(routeIds(reconcileConfig(live, desired()).config)[0], "(global)");
});

Deno.test("reconciling twice changes nothing more", () => {
	const once = reconcileConfig(liveCluster(), desired()).config;
	assertEquals(reconcileConfig(once, desired()).config, once);
});

Deno.test("key order in Caddy's stored config does not count as an edit", () => {
	// Caddy returns config with object keys sorted; rig writes them in its own order.
	const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys)
		: v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
	const stored = sortKeys(reconcileConfig(null, desired()).config);
	const { config, notes } = reconcileConfig(stored, desired());
	assertEquals(notes.filter(n => n.includes("hand-edited")), []);
	assertEquals(config.apps.tls.automation.on_demand, stored.apps.tls.automation.on_demand);
});
