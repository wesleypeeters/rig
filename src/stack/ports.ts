import caddyApiFetch from "../caddy/api.ts";
import caddyFetch from "../caddy/fetch.ts";
import isDockerDesktop from "../docker/isDesktop.ts";
import fatalError from "../util/fatal.ts";

/*
 * Each stack publishes its routed services on one 10-port range.
 *
 * Clusters use 49160-65529: 1637 aligned ranges inside the IANA dynamic range
 * (49152-65535), clear of registered service ports. Docker Desktop and
 * OrbStack use 45000-49149 instead, because macOS hands out 49152-65535 as
 * ephemeral source ports and a clash there makes a publish fail.
 */
export const portRangeLength = 10;
export const [firstPort, lastPort] = isDockerDesktop ? [45000, 49149] : [49160, 65529];
const nPortRanges = Math.floor((lastPort - firstPort + 1) / portRangeLength);

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

async function findFreePortRangeId() {
	const portRanges: Array<{ ["@id"]: number }> = await caddyApiFetch("get", "@vars/portRanges");
	const reserved = new Set(portRanges.map(o => o["@id"]));
	for (let id = 0; id < nPortRanges; id++) {
		if (!reserved.has(id)) return id;
	}
	fatalError("All port ranges are in use");
}

/**
 * Reserve a free port range and return its id.
 *
 * Two deploys running at once can both see the same range as free. The claim
 * is the POST itself: Caddy refuses a config holding a duplicate @id, so only
 * one of them lands and the other looks again.
 */
export async function claimPortRange(): Promise<number> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const id = await findFreePortRangeId();
		const response = await caddyFetch("post", "id/@vars/portRanges", JSON.stringify({ "@id": id }));
		if (response.ok) return id;
		if (!response.body.includes("duplicate ID")) fatalError(`Could not reserve port range ${id}: ${response.body}`);
	}
	fatalError("Could not reserve a port range: too many concurrent deploys");
}
