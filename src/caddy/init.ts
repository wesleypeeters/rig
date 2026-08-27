import caddyFetch from "./fetch.ts";
import buildStripRegex from "./stripRegex.ts";
import { defaultOnDemandInternalSubjects, publicAllowlistSentinel } from "./tls.ts";
import { customisedRigPolicies, foreignPolicies, foreignVars, mergePolicies } from "./ownership.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

const clusterTld = Deno.args[2] || ".localhost";
const privateSubnet = Deno.args.find(a => a.startsWith("--private-subnet="))?.split("=")[1] || null;
// An application on this cluster can vouch for hostnames rig cannot infer from
// a route matcher — a per-customer `cdn.<domain>` served by one shared route,
// for instance. See syncPublicSubjects: the list stays explicit either way.
const extraSubjectsUrl = Deno.args.find(a => a.startsWith("--extra-subjects-url="))?.split("=").slice(1).join("=") || null;
const force = Deno.args.includes("--force");

const stripRegex = buildStripRegex(clusterTld);

const onDemandInternalSubjectsTlsPolicy = {
	"@id": "@ondemand-internal-subjects",
	issuers: [{ module: "internal" }],
	on_demand: true,
	subjects: defaultOnDemandInternalSubjects
};

// Public ACME issuance is scoped to an explicit allowlist that rig keeps in
// sync with the deployed stacks (see syncPublicSubjects). Without a subjects
// list this policy matched every SNI, so any scanner spraying junk hostnames
// at the cluster opened an ACME order per name and exhausted the Let's Encrypt
// new-orders-per-account limit, starving real review envs of certs. The
// sentinel keeps the list non-empty (empty == match all in Caddy).
const onDemandSubjectsTlsPolicy = {
	"@id": "@ondemand-subjects",
	issuers: [{ module: "acme" }],
	on_demand: true,
	subjects: [publicAllowlistSentinel]
};

const internalSubjectsTlsPolicy = {
	"@id": "@internal-subjects",
	issuers: [{ module: "internal" }],
	subjects: ["localhost"]
};

const initialLocalhostRoute = {
	"@id": "localhost",
	handle: [
		{
			body: "rig is running",
			handler: "static_response"
		}
	],
	match: [{ host: ["localhost", Deno.hostname()] }],
	terminal: true
};

const stripHostHeaderHandler = {
	handler: "headers",
	request: {
		replace: {
			host: [{ search_regexp: stripRegex, replace: "$1" }]
		}
	}
};

// RFC 9111 conditional caching via Souin (Otter in-process backend).
// Backends opt in by setting Cache-Control: public, max-age=... on responses.
const cacheHandler = {
	handler: "cache",
	api: { souin: {} },
	otter: { configuration: { size: 50000 } },
	default_cache_control: "no-store",
	ttl: "10s",
	stale: "1h"
};

const globalVarsHandler = {
	"@id": "@vars",
	handler: "vars",
	requestHost: "{http.request.host}",
	portRanges: [],
	clusterTld,
	...(privateSubnet ? { privateSubnet } : {}),
	...(extraSubjectsUrl ? { extraSubjectsUrl } : {})
};

const wildcardsMatcher = {
	match: [
		{
			"@id": "@wildcards",
			host: []
		}
	]
};

const config = {
	logging: {
		logs: {
			default: {
				"@id": "@log"
			}
		}
	},
	apps: {
		http: {
			servers: {
				srv0: {
					"@id": "@stacks",
					listen: [":443"],
					// Route matchers are registered with the TLD stripped (app.r33, not
					// app.r33.reshark.dev), so they are not real public names. Let Caddy's
					// automatic HTTPS skip cert management for them; public certs are
					// obtained on-demand against the FQDN allowlist instead.
					automatic_https: { disable_certificates: true },
					client_ip_headers: [
						"CF-Connecting-IP",
						"X-Real-IP",
						"X-Forwarded-For"
					],
					tls_connection_policies: [
						{}
					],
					trusted_proxies: {
						interval: "12h",
						source: "cloudflare",
						timeout: "15s"
					},
					trusted_proxies_strict: 1,
					routes: [
						{
							handle: [
								globalVarsHandler,
								stripHostHeaderHandler,
								cacheHandler
							]
						},
						wildcardsMatcher,
						initialLocalhostRoute
					]
				}
			}
		},
		tls: {
			automation: {
				// This endpoint always answers 200 (it just reads back admin config),
				// so it grants every request it sees. That is acceptable only because
				// the on_demand policies above are scoped: ACME on_demand is gated by
				// the FQDN allowlist and the internal one by *.localhost, so an
				// unknown SNI never reaches this check. Tightening it to a real
				// deny-by-default handler would be belt-and-suspenders.
				on_demand: {
					permission: {
						module: "http",
						endpoint: "http://127.0.0.1:2019/config/apps/tls/automation/on_demand/permission/endpoint"
					}
				},
				policies: [
					onDemandInternalSubjectsTlsPolicy,
					internalSubjectsTlsPolicy,
					onDemandSubjectsTlsPolicy,
				]
			}
		}
	}
};

// `POST /load` replaces the ENTIRE config, which is right on an empty cluster
// and destructive on a live one — Caddy config is shared with humans. Read what
// is there first and reconcile against it. See ownership.ts for the two rules.
const existingResponse = await caddyFetch("get", "config/");
let existingConfig: any = null;
try {
	existingConfig = existingResponse.ok ? JSON.parse(existingResponse.body || "null") : null;
} catch {
	existingConfig = null;
}

if (existingConfig?.apps?.tls || existingConfig?.apps?.http) {
	const existingPolicies = existingConfig?.apps?.tls?.automation?.policies ?? [];
	const desiredPolicies = config.apps.tls.automation.policies;

	// REFUSE: rig's own objects that a human has changed. Overwriting these
	// resolves a disagreement by force, so make it a decision, not a side effect.
	const customised = customisedRigPolicies(existingPolicies, desiredPolicies);
	if (customised.length && !force) {
		fatalError(
			`This cluster's Caddy config has been edited since it was initialised:\n` +
			customised.map(c => `  - ${c}`).join("\n") +
			`\n\nRe-initialising would replace those with rig's defaults. On a live cluster that ` +
			`can stop certificates renewing.\nRe-run with --force if that is genuinely what you want.`
		);
	}

	// PRESERVE: objects rig never authored. It has no opinion about them, so
	// removing them was never intentional — only careless.
	const foreign = foreignPolicies(existingPolicies);
	if (foreign.length) {
		info(`Preserving ${foreign.length} automation polic${foreign.length === 1 ? "y" : "ies"} rig did not create: ${foreign.map((p: any) => p["@id"]).join(", ")}`);
	}
	config.apps.tls.automation.policies = mergePolicies(existingPolicies, desiredPolicies) as typeof desiredPolicies;

	const carriedVars = foreignVars(findVars(existingConfig));
	if (Object.keys(carriedVars).length) {
		info(`Preserving @vars set outside rig: ${Object.keys(carriedVars).join(", ")}`);
		Object.assign(globalVarsHandler, carriedVars);
	}

	if (customised.length) info(`--force: replacing ${customised.length} edited rig object(s)`);
}

const response = await caddyFetch("post", "load", JSON.stringify(config));
response.ok || fatalError(JSON.parse(response.body).error);
info(`Caddy initialized with TLD ${clusterTld}${privateSubnet ? ` (private subnet: ${privateSubnet})` : ""}`);

/** The `@vars` handler, wherever it sits in the existing route tree. */
function findVars(cfg: any): Record<string, unknown> {
	const routes = cfg?.apps?.http?.servers?.srv0?.routes ?? [];
	for (const route of routes) {
		for (const handler of route?.handle ?? []) {
			if (handler?.["@id"] === "@vars") return handler;
		}
	}
	return {};
}
