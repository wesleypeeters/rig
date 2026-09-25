import "./validate.ts";
import fatalError from "../util/fatal.ts";
import { awaitMode, ciMode } from "../constants.ts";
import info from "../util/info.ts";
import hasKeys from "../util/hasKeys.ts";
import removeSwarmStack from "../stack/removeSwarmStack.ts";
import caddyApiFetch from "../caddy/api.ts";
import $ from "@david/dax";
import { portAssignments, portRangeId, stackExists } from "../stack/caddyVars.ts";
import dedupe from "../util/dedupe.ts";
import getCanonicalHost from "../util/getCanonicalHost.ts";
import processFiles from "../stack/processFiles.ts";
import { exists } from "@std/fs/exists";
import lockFilePath from "../stack/lockfile.ts";
import stack from "../stack/parsed.ts";
import "../stack/name.ts";
import id from "../stack/id.ts";
import type { RouteConfig } from "../stack/types.ts";
import { encodeBase58 } from "@std/encoding/base58";
import { createCaddyStackConfig } from "../caddy/routes.ts";
import { prNumber } from "../github/pr.ts";
import syncPublicSubjects from "../caddy/syncPublicSubjects.ts";
import { portRangeLength, getRangeFirstPort, claimPortRange, assignPortOffsets } from "../stack/ports.ts";

const { routes } = stack["x-rig"];
const { configs = {}, secrets = {}, services = {} } = stack;
const files = [...Object.values(configs), ...Object.values(secrets)];

/** Routes that proxy to a service. An `access: none` route answers 403 itself. */
function proxiedRoutes(): RouteConfig[] {
	return Object.values(routes).flatMap(hostRoutes => Object.values(hostRoutes)).filter(r => r.access !== "none");
}

function getServicePorts() {
	return dedupe(
		proxiedRoutes()
			.map(({ target }) => target)
			.filter(({ hostname }) => !hostname.includes("."))
			.map(target => getCanonicalHost(target))
	);
}

/**
 * Everything that can fail on the stack's own inputs, checked before Caddy is
 * touched: a deploy that stops halfway must not leave routes pointing at
 * services that were never deployed.
 */
async function preflight(servicePorts: string[]) {
	if (servicePorts.length > portRangeLength) fatalError(`A stack can't expose more than ${portRangeLength} ports`);
	for (const servicePort of servicePorts) {
		const [hostname] = servicePort.split(":", 1);
		if (!services[hostname]) fatalError(`Service "${hostname}" not found in stack`);
	}
	if (!hasKeys(services)) return;
	if (!(await exists(lockFilePath))) fatalError("Stack must be built before it can be deployed");
	const lock: Record<string, string> = JSON.parse(await Deno.readTextFile(lockFilePath));
	for (const serviceName in services) {
		if (!lock[serviceName]) fatalError(`Image for ${serviceName} service not found in lockfile`);
		services[serviceName].image = lock[serviceName];
	}
	for (const f of files) {
		if (!f["x-rig-env"]) continue;
		if (ciMode) fatalError(`x-rig-env ${f["x-rig-env"]} not resolved in CI mode`);
		if (!f.file) fatalError(`x-rig-env ${f["x-rig-env"]} not resolved and no file: fallback`);
		delete f["x-rig-env"];
	}
}

async function deploySwarmStack(servicePorts: string[], portOffsets: Record<string, number>, rangeId?: number) {
	if (rangeId !== undefined) {
		const rangeFirstPort = getRangeFirstPort(rangeId);
		for (const servicePort of servicePorts) {
			const [hostname, port] = servicePort.split(":", 2);
			const ports = services[hostname].ports ??= [];
			ports.push({ target: Number(port), published: rangeFirstPort + portOffsets[servicePort] });
		}
	}
	const prefix = encodeBase58(id).slice(-11);
	await processFiles(files, prefix);
	Object.values(services).forEach(s => {
		delete s.build;
		delete s.env_file;
	});
	info(`Deploying ${id} swarm stack...`);
	await $`docker stack deploy -d=${!awaitMode} --prune --with-registry-auth -c - ${id}`.stdinText(JSON.stringify(stack));
}

async function deployCaddyStack(portOffsets: Record<string, number>, rangeId?: number) {
	if (rangeId !== undefined) {
		info(`Deploying ${id} caddy routes...`);
		const rangeFirstPort = getRangeFirstPort(rangeId);
		proxiedRoutes().forEach(({ target }) => {
			target.host = `host:${rangeFirstPort + portOffsets[getCanonicalHost(target)]}`;
		});
	}
	const [method, objectUrl] = stackExists ? ["patch", id] : ["post", "@stacks/routes"];
	const vars = await caddyApiFetch("get", "@vars") || {};
	const privateSubnet: string[] | undefined = vars.privateSubnet?.split(",");
	await caddyApiFetch(method, objectUrl, createCaddyStackConfig(id, routes, rangeId, { privateSubnet, prNumber, portAssignments: portOffsets }));
	// The stack no longer publishes anything: give its range back.
	if (portRangeId !== undefined && rangeId === undefined) await caddyApiFetch("delete", String(portRangeId));
}

async function deploy() {
	const servicePorts = getServicePorts();
	await preflight(servicePorts);
	const rangeId = servicePorts.length ? (portRangeId ?? await claimPortRange()) : undefined;
	const portOffsets = assignPortOffsets(servicePorts, portAssignments);
	if (id !== "caddy") {
		await deployCaddyStack(portOffsets, rangeId);
		await syncPublicSubjects();
	}
	if (hasKeys(services)) {
		await deploySwarmStack(servicePorts, portOffsets, rangeId);
	} else if (stackExists) {
		await removeSwarmStack(id);
	}
	info("Done.");
}

// Log exposed routes.
Object.entries(routes).forEach(([hosts, hostRoutes]) => {
	Object.keys(hostRoutes).forEach(route => {
		hosts.split(/\s+/).forEach(host => info(`Exposing route ${host}${route}`));
	});
	if (!hasKeys(hostRoutes)) delete routes[hosts];
});

deploy();
