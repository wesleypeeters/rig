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

/**
 * Assign each routed `service:port` a stable offset (0..portRangeLength-1) within
 * the stack's port range. Offsets already held by a still-present `service:port`
 * are preserved; only new entries take the lowest free offset.
 *
 * This stability matters on redeploys: Swarm publishes each routed service on an
 * ingress port and can't move a service onto a port its still-running task holds.
 * If offsets were derived from array position, adding or removing one route would
 * renumber the others and the rolling update would fail with "port X is already
 * in use by service Y". Preserving offsets means adding a route only allocates a
 * new port and never disturbs the existing services.
 *
 * @param servicePorts deduped `service:port` strings for this stack's routes
 * @param stored the offset map persisted from the previous deploy (empty on first)
 */
export function assignPortOffsets(
	servicePorts: string[],
	stored: Record<string, number> = {},
): Record<string, number> {
	const offsets: Record<string, number> = {};
	const used = new Set<number>();

	// Keep the offset of every service:port that still exists.
	for (const servicePort of servicePorts) {
		const offset = stored[servicePort];
		if (offset !== undefined && offset >= 0 && offset < portRangeLength && !used.has(offset)) {
			offsets[servicePort] = offset;
			used.add(offset);
		}
	}

	// Give any new service:port the lowest free offset in the range.
	let next = 0;
	for (const servicePort of servicePorts) {
		if (servicePort in offsets) continue;
		while (used.has(next)) next++;
		if (next >= portRangeLength) fatalError(`A stack can't expose more than ${portRangeLength} ports`);
		offsets[servicePort] = next;
		used.add(next);
	}

	return offsets;
}

export async function findNextPortRangeId() {
	const portRanges: Array<{ ["@id"]: number }> = await caddyApiFetch("get", "@vars/portRanges");
	const reserved = new Set(portRanges.map(o => o["@id"]));
	for (let id = 0; id < nPortRanges; id++) {
		if (!reserved.has(id)) return id;
	}
	fatalError("All port ranges are in use");
}
