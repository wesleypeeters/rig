import $ from "@david/dax";
import { optional } from "../util/env.ts";

/**
 * Find review stacks that belong to closed PRs.
 */
export async function findStaleReviewStacks(stackName: string, maxAgeMs?: number): Promise<string[]> {
	const stacks = (await $`docker stack ls --format "{{.Name}}"`.text()).trim().split("\n").filter(Boolean);
	const pattern = new RegExp(`^${stackName}_r(\\d+)$`);
	const stale: string[] = [];
	const { GITHUB_TOKEN, GITHUB_REPOSITORY } = optional;

	for (const name of stacks) {
		const match = name.match(pattern);
		if (!match) continue;
		const prNumber = Number(match[1]);
		// Check if PR is closed.
		if (GITHUB_TOKEN && GITHUB_REPOSITORY) {
			const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${prNumber}`, {
				headers: { authorization: `Bearer ${GITHUB_TOKEN}` }
			});
			if (response.ok) {
				const pr = await response.json();
				if (pr.state !== "open") {
					stale.push(name);
					continue;
				}
			}
		}
		// Check age.
		if (maxAgeMs) {
			const created = await $`docker stack ps ${name} --format "{{.CreatedAt}}" --no-trunc`.text();
			const firstLine = created.trim().split("\n")[0];
			if (firstLine && (Date.now() - new Date(firstLine).getTime()) > maxAgeMs) stale.push(name);
		}
	}
	return stale;
}
