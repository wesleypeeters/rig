import caddyApiFetch from "../caddy/api.ts";
import isDockerDesktop from "../docker/isDesktop.ts";
import fatalError from "../util/fatal.ts";

/*
 * Safe port ranges: 49152-65535.
 * We use 49160-65529 giving us 1636 neatly aligned 10-port ranges.
 * On Docker Desktop we avoid the ephemeral range to prevent conflicts.
 */
export const portRangeLength = 10;
export const [firstPort, lastPort] = isDockerDesktop ? [45000, 49150] : [49160, 65529];
const nPorts = lastPort - firstPort + 1;
const nPortRanges = nPorts / portRangeLength - 1;

export function getRangeFirstPort(portRangeId: number) {
	return firstPort + portRangeId * portRangeLength;
}

export async function findNextPortRangeId() {
	const portRanges: Array<{ ["@id"]: number }> = await caddyApiFetch("get", "@vars/portRanges");
	const reserved = new Set(portRanges.map(o => o["@id"]));
	for (let id = 0; id < nPortRanges; id++) {
		if (!reserved.has(id)) return id;
	}
	fatalError("All port ranges are in use");
}
