import buildStripRegex from "./stripRegex.ts";
import { defaultOnDemandInternalSubjects, publicAllowlistSentinel } from "./tls.ts";

export type BaseConfigOptions = {
	clusterTld: string;
	privateSubnet?: string;
	extraSubjectsUrl?: string;
	// Claimed port ranges. A fresh cluster has none; a re-init must carry the
	// live list over, or the next deploy hands out ports that running stacks hold.
	portRanges?: unknown[];
	// Answers the "rig is running" health route alongside localhost.
	hostname: string;
};

/**
 * The Caddy config `rig caddy init` wants. On a fresh cluster it is loaded as
 * is; on a live one ownership.ts reconciles it with what is already there.
 */
export default function buildBaseConfig({ clusterTld, privateSubnet, extraSubjectsUrl, portRanges = [], hostname }: BaseConfigOptions) {
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
		match: [{ host: ["localhost", hostname] }],
		terminal: true
	};

	const stripHostHeaderHandler = {
		handler: "headers",
		request: {
			replace: {
				host: [{ search_regexp: buildStripRegex(clusterTld), replace: "$1" }]
			}
		}
	};

	const globalVarsHandler = {
		"@id": "@vars",
		handler: "vars",
		requestHost: "{http.request.host}",
		portRanges,
		clusterTld,
		...(privateSubnet ? { privateSubnet } : {}),
		...(extraSubjectsUrl ? { extraSubjectsUrl } : {})
	};

	return {
		logging: {
			logs: {
				// Access lines go to the access log below; without this exclude the
				// default log (stderr) would write every request a second time.
				default: {
					"@id": "@log",
					exclude: ["http.log.access"]
				},
				// Access log: one JSON line per request on stdout (`docker service logs
				// caddy_caddy`), with client IP, host, path, status and user agent, so a
				// cluster can answer "who is hitting us" without a proxy in front.
				access: {
					"@id": "@access-log",
					writer: { output: "stdout" },
					encoder: { format: "json" },
					include: ["http.log.access"]
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
						// app.r33.example.dev), so they are not real public names. Let Caddy's
						// automatic HTTPS skip cert management for them; public certs are
						// obtained on-demand against the FQDN allowlist instead.
						automatic_https: { disable_certificates: true },
						logs: { default_logger_name: "access" },
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
						onDemandSubjectsTlsPolicy
					]
				}
			}
		}
	};
}
