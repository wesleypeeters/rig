import $ from "@david/dax";
import id from "./id.ts";
import info from "../util/info.ts";
import fatalError from "../util/fatal.ts";
import { optional } from "../util/env.ts";

async function findRunningTask(service: string) {
	const out = await $`docker service ps ${id}_${service} --filter desired-state=running --format {{.ID}}\t{{.Node}} --no-trunc`.noThrow().text();
	const line = out.trim().split("\n").filter(Boolean)[0];
	if (!line) return null;
	const [taskId, node] = line.split("\t");
	return { taskId, node };
}

async function getContainerId(taskId: string) {
	const out = await $`docker inspect ${taskId} --format {{.Status.ContainerStatus.ContainerID}}`.noThrow().text();
	return out.trim();
}

export type ContainerLocation = { containerId: string; dockerHost?: string };

export default async function (service: string): Promise<ContainerLocation> {
	let task = await findRunningTask(service);
	if (!task) {
		info(`No running container for ${service}, forcing service update...`);
		const updated = await $`docker service update --force --detach=false ${id}_${service}`.noThrow();
		if (updated.code !== 0) fatalError(`No service ${id}_${service} found`);
		task = await findRunningTask(service);
		if (!task) fatalError(`No running container found for ${service}`);
	}
	const containerId = await getContainerId(task.taskId);
	if (!containerId) fatalError(`Container for ${service} task not yet assigned`);
	const localNode = (await $`docker info --format {{.Name}}`.text()).trim();
	if (task.node === localNode) return { containerId };
	const remoteNode = task.node;
	const ip = (await $`docker node inspect ${remoteNode} --format {{.Status.Addr}}`.text()).trim();
	const sshUser = optional.CLUSTER_SSH_USER || optional.USER;
	if (!sshUser) fatalError("CLUSTER_SSH_USER must be set to reach remote node");
	info(`Container is on remote node ${remoteNode}, tunneling via SSH...`);
	return { containerId, dockerHost: `ssh://${sshUser}@${ip}` };
}
