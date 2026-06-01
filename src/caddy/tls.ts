export function generateSubjectWildcards(domain: string, levels: number) {
	const patterns: string[] = [];
	for (let i = 0; i < levels; i++) patterns.push(domain = `*.${domain}`);
	return patterns;
}

export const defaultOnDemandInternalSubjects = [
	...generateSubjectWildcards("localhost", 10)
];

// Keeps the public on-demand ACME policy's subjects list non-empty when no
// stacks are deployed. An empty subjects array means "match all" in Caddy,
// which would reopen the policy to every SNI; a single inert sentinel keeps it
// scoped. It sits under .localhost so the internal policy claims it first and
// it can never trigger a public ACME order even if a scanner sprays it.
export const publicAllowlistSentinel = "_rig-public-allowlist-sentinel.localhost";
