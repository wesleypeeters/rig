import $ from "@david/dax";
import id from "./id.ts";
import info from "../util/info.ts";
import fatalError from "../util/fatal.ts";

async function getId(service: string) {
	const out = await $`docker ps --filter name=${id}_${service} --format "{{.ID}}"`.text();
	return out.trim().split("\n").filter(Boolean)[0];
}

export default async function (service: string) {
	let containerId = await getId(service);
	if (containerId) return containerId;
	info(`No running container for ${service}, forcing service update...`);
	const updated = await $`docker service update --force --detach=false ${id}_${service}`.noThrow();
	if (updated.code !== 0) fatalError(`No service ${id}_${service} found`);
	containerId = await getId(service);
	if (!containerId) fatalError(`No running container found for ${service}`);
	return containerId;
}
