import $ from "@david/dax";
import info from "../util/info.ts";
import fatalError from "../util/fatal.ts";
import name from "../stack/name.ts";
import removeCaddyConfig from "../stack/removeCaddyConfig.ts";
import caddyApiFetch from "../caddy/api.ts";
import { optional } from "../util/env.ts";

const maxAgeArg = Deno.args.find(a => a.startsWith("--max-age="));
const maxAgeMs = maxAgeArg ? parseDuration(maxAgeArg.split("=")[1]) : null;

function parseDuration(s: string): number {
	const match = s.match(/^(\d+)(h|d)$/);
	if (!match) throw new Error(`Invalid duration: ${s}`);
	const [, n, unit] = match;
	return Number(n) * (unit === "h" ? 3600000 : 86400000);
}

// Find all review stacks for this stack name.
const stacks = (await $`docker stack ls --format "{{.Name}}"`.text()).trim().split("\n").filter(Boolean);
const reviewPattern = new RegExp(`^${name}_r(\\d+)$`);
const reviewStacks = stacks
	.map(s => ({ name: s, match: s.match(reviewPattern) }))
	.filter(({ match }) => match)
	.map(({ name, match }) => ({ name, prNumber: Number(match![1]) }));

if (!reviewStacks.length) {
	info("No review stacks found.");
	Deno.exit(0);
}

const { GITHUB_TOKEN, GITHUB_REPOSITORY } = optional;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
	fatalError("cleanup needs GITHUB_TOKEN and GITHUB_REPOSITORY to check PR state; set them in the workflow env");
}
let removed = 0;

for (const stack of reviewStacks) {
	let isStale = false;
	// Check if PR is still open.
	const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${stack.prNumber}`, {
		headers: { authorization: `Bearer ${GITHUB_TOKEN}` }
	});
	if (response.ok) {
		const pr = await response.json();
		isStale = pr.state !== "open";
	}
	if (!isStale && maxAgeMs) {
		// Check stack age via docker service inspect.
		const created = await $`docker stack ps ${stack.name} --format "{{.CreatedAt}}" --no-trunc`.text();
		const firstLine = created.trim().split("\n")[0];
		if (firstLine && (Date.now() - new Date(firstLine).getTime()) > maxAgeMs) isStale = true;
	}
	if (isStale) {
		info(`Removing stale review stack ${stack.name}...`);
		const vars: any = await caddyApiFetch("get", `${stack.name}/handle/0`);
		const portRangeId = vars?.portRangeId;
		await $`docker stack rm ${stack.name}`;
		await removeCaddyConfig(stack.name, portRangeId);
		removed++;
	}
}

info(`Done. Removed ${removed} stale review stack${removed === 1 ? "" : "s"}.`);
