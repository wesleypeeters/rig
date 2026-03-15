import $ from "@david/dax";
import fatalError from "../util/fatal.ts";

let containerId: string;

async function getContainerId() {
	if (!containerId) {
		try {
			containerId = (await $`docker ps --filter name=caddy_caddy --format "{{.ID}}"`.text()).trim().split("\n")[0];
			if (!containerId) throw new Error();
		} catch {
			fatalError("Caddy container not found.");
		}
	}
	return containerId;
}

/**
 * HTTP request to Caddy's admin API via curl inside the container.
 */
export default async function (method = "get", url = "", body?: string, contentType = "application/json") {
	const id = await getContainerId();
	const args = ["-s", "-w", "\n%{http_code}", "-X", method.toUpperCase()];
	if (body) args.push("-H", `Content-Type: ${contentType}`, "-d", body);
	const output = await $`docker exec ${id} curl ${args} http://127.0.0.1:2019/${url}`.text();
	const lines = output.trimEnd().split("\n");
	const status = Number(lines.pop());
	const responseBody = lines.join("\n");
	return {
		ok: status >= 200 && status < 300,
		status,
		text: () => responseBody,
		json: () => JSON.parse(responseBody || "null")
	};
}
