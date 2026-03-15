import caddyFetch from "./fetch.ts";
import { defaultOnDemandInternalSubjects, generateSubjectWildcards } from "./tls.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

const clusterTld = Deno.args[2] || ".localhost";

// Build the strip regex from the cluster TLD.
// Examples:
//   .localhost           -> (.+)\.localhost$
//   .dev.example.com     -> (.+)\.[^.]+\.dev\.example\.com$
//   .devhost             -> (.+)\.\w*host$
const escapedTld = clusterTld.slice(1).replace(/\./g, "\\.");
const isHostTld = clusterTld.endsWith("host");
const stripRegex = isHostTld
	? "(.+)\\.\\w*host$"
	: `(.+)\\.${clusterTld.includes("host") ? "\\w*host" : `[^.]+\\.${escapedTld}`}$`;

const onDemandInternalSubjectsTlsPolicy = {
	"@id": "@ondemand-internal-subjects",
	issuers: [{ module: "internal" }],
	on_demand: true,
	subjects: defaultOnDemandInternalSubjects
};

const onDemandSubjectsTlsPolicy = {
	"@id": "@ondemand-subjects",
	issuers: [{ module: "acme" }],
	on_demand: true
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
	portRanges: []
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
response.ok || fatalError(response.json().error);
info(`Caddy initialized with TLD ${clusterTld}`);
