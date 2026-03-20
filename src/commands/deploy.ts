import "./validate.ts";
import fatalError from "../util/fatal.ts";
import { awaitMode } from "../constants.ts";
import info from "../util/info.ts";
import hasKeys from "../util/hasKeys.ts";
import removeSwarmStack from "../stack/removeSwarmStack.ts";
import caddyApiFetch from "../caddy/api.ts";
import $ from "@david/dax";
import { portRangeId, stackExists } from "../stack/caddyVars.ts";
import dedupe from "../util/dedupe.ts";
import getCanonicalHost from "../util/getCanonicalHost.ts";
import processFiles from "../stack/processFiles.ts";
import { exists } from "@std/fs/exists";
import lockFilePath from "../stack/lockfile.ts";
import stack from "../stack/parsed.ts";
import "../stack/name.ts";
import id from "../stack/id.ts";
import type { Stack } from "../stack/types.ts";
import { encodeBase58 } from "@std/encoding/base58";
import { createCaddyStackConfig } from "../caddy/routes.ts";
import { portRangeLength, getRangeFirstPort, findNextPortRangeId } from "../stack/ports.ts";

const { routes } = stack["x-rig"];

function lockImages(services: Stack["services"], lock: Record<string, string>) {
	for (const serviceName in services) {
		const image = lock[serviceName];
		if (!image) fatalError(`Image for ${serviceName} service not found in lockfile`);
		services[serviceName].image = lock[serviceName];
	}
}

function getServicePorts() {
	return dedupe(
		Object.values(routes)
			.map(hostRoutes => Object.values(hostRoutes))
			.flat()
			.map(({ target }) => target)
			.filter(({ hostname }) => !hostname.includes("."))
			.map(target => getCanonicalHost(target))
	);
}

async function deploySwarmStack(servicePorts: string[], allocatedPortRangeId?: number) {
	if (!(await exists(lockFilePath))) fatalError("Stack must be built before it can be deployed");
	const { configs = {}, secrets = {}, services = {} } = stack;
	lockImages(services, JSON.parse(await Deno.readTextFile(lockFilePath)));
	if (servicePorts.length && allocatedPortRangeId !== undefined) {
		let publishedPort = getRangeFirstPort(allocatedPortRangeId);
		servicePorts.forEach(servicePort => {
			const [hostname, port] = servicePort.split(":", 2);
			const service = services[hostname];
			if (!service) fatalError(`Service "${hostname}" not found in stack`);
			const ports = service.ports ??= [];
			ports.push({ target: Number(port), published: publishedPort++ });
		});
	}
	const { values } = Object;
	const files = [...values(configs), ...values(secrets)];
	const prefix = encodeBase58(id).slice(-11);
	await processFiles(files, prefix);
	values(services).forEach(s => delete s.build);
	info(`Deploying ${id} swarm stack...`);
	await $`docker stack deploy -d=${!awaitMode} --prune --with-registry-auth -c - ${id}`.stdinText(JSON.stringify(stack));
}

async function deployCaddyStack(servicePorts: string[], confirmedPortRangeId?: number) {
	if (hasKeys(routes)) {
		info(`Deploying ${id} caddy routes...`);
		const rangeFirstPort = getRangeFirstPort(confirmedPortRangeId!);
		Object.values(routes).forEach(subroutes => Object.values(subroutes).forEach(({ target }) => {
			target.host = `host:${rangeFirstPort + servicePorts.indexOf(getCanonicalHost(target))}`;
		}));
	}
	const [method, objectUrl] = stackExists ? ["patch", id] : ["post", "@stacks/routes"];
	await caddyApiFetch(method, objectUrl, createCaddyStackConfig(id, routes, confirmedPortRangeId!));
	if (confirmedPortRangeId !== portRangeId) {
		if (portRangeId !== undefined && !confirmedPortRangeId) {
			await caddyApiFetch("delete", String(portRangeId));
		} else {
			await caddyApiFetch("post", "@vars/portRanges", { "@id": confirmedPortRangeId });
		}
	}
}

async function deploy() {
	const servicePorts = getServicePorts();
	if (servicePorts.length > portRangeLength) fatalError(`A stack can't expose more than ${portRangeLength} ports`);
	const confirmedPortRangeId = servicePorts.length ? (portRangeId ?? await findNextPortRangeId()) : undefined;
	if (id !== "caddy") await deployCaddyStack(servicePorts, confirmedPortRangeId!);
	if (hasKeys(stack.services)) {
		Object.values(stack.services).forEach(service => delete service.env_file);
		await deploySwarmStack(servicePorts, confirmedPortRangeId!);
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
