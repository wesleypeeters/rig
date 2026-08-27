import { assertEquals } from "@std/assert";
import {
	customisedRigPolicies,
	foreignPolicies,
	foreignVars,
	mergePolicies
} from "./ownership.ts";

/**
 * These tests are written against the shape that actually caused the problem:
 * a live cluster carrying two hand-added policies (`@reshark-io`, `@cloudflare`)
 * and DNS-01 issuers on rig's own `@ondemand-subjects`, where `rig caddy init`
 * would have removed all three and stopped every certificate renewing.
 */

const rigDefaults = [
	{ "@id": "@ondemand-internal-subjects", issuers: [{ module: "internal" }], on_demand: true, subjects: ["*.localhost"] },
	{ "@id": "@internal-subjects", issuers: [{ module: "internal" }], subjects: ["localhost"] },
	{ "@id": "@ondemand-subjects", issuers: [{ module: "acme" }], on_demand: true, subjects: ["_sentinel.localhost"] }
];

const liveShape = [
	{ "@id": "@ondemand-internal-subjects", issuers: [{ module: "internal" }], on_demand: true, subjects: ["*.localhost"] },
	{ "@id": "@internal-subjects", issuers: [{ module: "internal" }], subjects: ["localhost"] },
	// Rig's own policy, customised: ZeroSSL + DNS-01, which rig's default lacks.
	{
		"@id": "@ondemand-subjects",
		issuers: [{ module: "acme", ca: "https://acme.zerossl.com/v2/DV90" }, { module: "acme" }],
		on_demand: true,
		subjects: ["dozzle.example.live", "api.example.io"]
	},
	{ "@id": "@reshark-io", issuers: [{ module: "acme" }], subjects: ["api.example.io"] },
	{ "@id": "@cloudflare", issuers: [{ module: "acme" }], subjects: ["*.example.live"] }
];

Deno.test("finds the policies rig never authored", () => {
	assertEquals(
		foreignPolicies(liveShape).map(p => p["@id"]),
		["@reshark-io", "@cloudflare"]
	);
});

Deno.test("a cluster with only rig's policies has nothing foreign", () => {
	assertEquals(foreignPolicies(rigDefaults), []);
});

Deno.test("spots a rig policy someone has customised", () => {
	// The real case: DNS-01 issuers added to @ondemand-subjects by hand.
	assertEquals(customisedRigPolicies(liveShape, rigDefaults), ["@ondemand-subjects.issuers"]);
});

Deno.test("an untouched cluster reports no customisation", () => {
	assertEquals(customisedRigPolicies(rigDefaults, rigDefaults), []);
});

Deno.test("ignores subjects, which rig rewrites on every deploy", () => {
	// Comparing this would make every established cluster look edited and train
	// people to pass --force, defeating the check.
	const drifted = structuredClone(rigDefaults);
	drifted[2].subjects = ["a.example.com", "b.example.com"];

	assertEquals(customisedRigPolicies(drifted, rigDefaults), []);
});

Deno.test("does not report a policy that is simply absent", () => {
	// Nothing was edited; init will just create it.
	assertEquals(customisedRigPolicies([rigDefaults[0]], rigDefaults), []);
});

Deno.test("notices a field removed from a rig policy, not only a changed one", () => {
	const stripped = structuredClone(rigDefaults);
	delete (stripped[2] as Record<string, unknown>).on_demand;

	assertEquals(customisedRigPolicies(stripped, rigDefaults), ["@ondemand-subjects.on_demand"]);
});

Deno.test("merging keeps the cluster's existing order", () => {
	// Order is load-bearing: Caddy takes the first policy whose subjects match,
	// so hoisting a foreign policy above @ondemand-subjects would change which
	// issuer serves a name.
	const merged = mergePolicies(liveShape, rigDefaults);

	assertEquals(merged.map(p => p["@id"]), [
		"@ondemand-internal-subjects",
		"@internal-subjects",
		"@ondemand-subjects",
		"@reshark-io",
		"@cloudflare"
	]);
});

Deno.test("merging replaces rig's own entries with the desired version", () => {
	const merged = mergePolicies(liveShape, rigDefaults);
	const ondemand = merged.find(p => p["@id"] === "@ondemand-subjects")!;

	assertEquals(ondemand.issuers, [{ module: "acme" }]);
});

Deno.test("merging preserves foreign policies untouched", () => {
	const merged = mergePolicies(liveShape, rigDefaults);

	assertEquals(merged.find(p => p["@id"] === "@cloudflare"), liveShape[4]);
});

Deno.test("merging appends rig policies the cluster does not have yet", () => {
	const merged = mergePolicies([liveShape[3]], rigDefaults);

	assertEquals(merged.map(p => p["@id"]), [
		"@reshark-io",
		"@ondemand-internal-subjects",
		"@internal-subjects",
		"@ondemand-subjects"
	]);
});

Deno.test("merging onto an empty cluster is just rig's defaults", () => {
	assertEquals(mergePolicies([], rigDefaults), rigDefaults);
});

Deno.test("keeps @vars keys somebody else put there", () => {
	assertEquals(
		foreignVars({
			"@id": "@vars",
			handler: "vars",
			clusterTld: ".example.live",
			portRanges: [1],
			someoneElsesFlag: "keep me"
		}),
		{ someoneElsesFlag: "keep me" }
	);
});

Deno.test("rig's own @vars keys are not treated as foreign", () => {
	assertEquals(
		foreignVars({ "@id": "@vars", clusterTld: ".x", privateSubnet: "10.0.0.0/8", extraSubjectsUrl: "https://x/y" }),
		{}
	);
});

Deno.test("survives a cluster with no vars at all", () => {
	assertEquals(foreignVars({}), {});
});
