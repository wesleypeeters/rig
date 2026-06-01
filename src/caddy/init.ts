import caddyFetch from "./fetch.ts";
import { defaultOnDemandInternalSubjects, publicAllowlistSentinel } from "./tls.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

const clusterTld = Deno.args[2] || ".localhost";
const privateSubnet = Deno.args.find(a => a.startsWith("--private-subnet="))?.split("=")[1] || null;

// Build the strip regex from the cluster TLD.
// Strips the TLD suffix from the Host header so route matchers see clean hostnames.
// Examples:
//   .localhost              -> (.+)\.localhost$
//   .dev.example.com        -> (.+)\.dev\.example\.com$
//   .devhost                -> (.+)\.\w*host$
const escapedTld = clusterTld.slice(1).replace(/\./g, "\\.");
const isHostTld = clusterTld.endsWith("host");
const stripRegex = isHostTld
	? "(.+)\\.\\w*host$"
	: `(.+)\\.${escapedTld}$`;

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

const globalVarsHandler = {
	"@id": "@vars",
	handler: "vars",
	requestHost: "{http.request.host}",
	portRanges: [],
	clusterTld,
	...(privateSubnet ? { privateSubnet } : {})
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
								stripHostHeaderHandler
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

const response = await caddyFetch("post", "load", JSON.stringify(config));
response.ok || fatalError(JSON.parse(response.body).error);
info(`Caddy initialized with TLD ${clusterTld}${privateSubnet ? ` (private subnet: ${privateSubnet})` : ""}`);
