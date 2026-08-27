/**
 * What `rig caddy init` owns, and what it must leave alone.
 *
 * THE PROBLEM THIS SOLVES. `init` writes the whole config with a single
 * `POST /load`, which is correct on an empty cluster and destructive on a live
 * one. Caddy config is shared with humans: a cluster acquires TLS automation
 * policies for names rig never hears about, DNS-01 issuers rig's defaults do not
 * include, and `@vars` keys set by hand. Re-running init silently replaced all
 * of it, and nothing said so until certificates stopped renewing.
 *
 * Two rules, and the distinction between them is the whole design:
 *
 *  - FOREIGN objects — ones rig did not create — are PRESERVED. rig has no
 *    opinion about a policy it has never heard of, so destroying it was never
 *    intentional, only careless.
 *  - RIG'S OWN objects that someone has CHANGED are REFUSED, not silently
 *    reverted. Here rig does have an opinion and it conflicts with a human's,
 *    which is a conversation, not something to resolve by overwriting. `--force`
 *    is how the human wins.
 *
 * Preserving cannot cover the second case: a customised `@ondemand-subjects`
 * is rig's object, so nothing about its identity marks it as somebody's work.
 * Only comparing it to the default reveals that, which is why both rules exist.
 */

/** Automation policies `init` authors. Anything else on the cluster is foreign. */
export const RIG_POLICY_IDS = [
	"@ondemand-internal-subjects",
	"@internal-subjects",
	"@ondemand-subjects"
];

/**
 * Fields rig itself rewrites AFTER init, so a difference is expected and means
 * nothing. Comparing these would make every established cluster look edited and
 * train people to pass `--force`, which would defeat the check entirely.
 */
const RUNTIME_MUTATED_POLICY_FIELDS = ["subjects"];

/** `@vars` keys init authors; any other key on the cluster was put there by someone else. */
export const RIG_VARS_KEYS = [
	"@id",
	"handler",
	"requestHost",
	"portRanges",
	"clusterTld",
	"privateSubnet",
	"extraSubjectsUrl"
];

type Policy = Record<string, unknown> & { "@id"?: string };

/** Policies rig did not author, in the order the cluster already has them. */
export function foreignPolicies(existing: Policy[]): Policy[] {
	return existing.filter(p => !RIG_POLICY_IDS.includes(String(p?.["@id"] ?? "")));
}

/**
 * Rig-owned policies a human has edited, described well enough to act on.
 *
 * Compares only what rig actually decides — issuers, the on-demand flag — and
 * skips what it rewrites at runtime. A cluster nobody has touched returns [].
 */
export function customisedRigPolicies(existing: Policy[], desired: Policy[]): string[] {
	const changes: string[] = [];

	for (const want of desired) {
		const id = String(want["@id"] ?? "");
		if (!RIG_POLICY_IDS.includes(id)) continue;

		const have = existing.find(p => String(p?.["@id"] ?? "") === id);
		if (!have) continue; // Absent, not edited — init will simply create it.

		for (const key of Object.keys({ ...have, ...want })) {
			if (key === "@id" || RUNTIME_MUTATED_POLICY_FIELDS.includes(key)) continue;
			if (JSON.stringify(have[key]) !== JSON.stringify(want[key])) {
				changes.push(`${id}.${key}`);
			}
		}
	}

	return changes;
}

/**
 * Merge rig's policies into the cluster's list WITHOUT reordering it.
 *
 * Order is load-bearing — Caddy takes the first policy whose subjects match, so
 * moving a foreign policy above `@ondemand-subjects` would quietly change which
 * issuer serves a name. Rig-owned entries are replaced where they already sit;
 * only genuinely new ones are appended.
 */
export function mergePolicies(existing: Policy[], desired: Policy[]): Policy[] {
	const desiredById = new Map(desired.map(p => [String(p["@id"] ?? ""), p]));

	const merged = existing.map(p => {
		const id = String(p?.["@id"] ?? "");
		const replacement = desiredById.get(id);
		if (replacement) desiredById.delete(id);
		return replacement ?? p;
	});

	return [...merged, ...desiredById.values()];
}

/** `@vars` entries someone added that rig would otherwise drop. */
export function foreignVars(existing: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(existing ?? {}).filter(([key]) => !RIG_VARS_KEYS.includes(key))
	);
}
