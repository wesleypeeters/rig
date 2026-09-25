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
	if (!match) fatalError(`Invalid duration ${JSON.stringify(s)}: use e.g. 48h or 2d`);
	const [, n, unit] = match;
	return Number(n) * (unit === "h" ? 3600000 : 86400000);
}

const reviewPattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_r(\\d+)$`);

// Review environments of this stack, found in Swarm and in Caddy. A Caddy-only
// entry is what a teardown leaves when it removed the Swarm stack but failed
// before the routes; without this it would hold its port range forever.
const swarmStacks = new Set(
	(await $`docker stack ls --format "{{.Name}}"`.text()).split("\n").filter(s => reviewPattern.test(s))
);
const caddyStacks = new Map<string, number | undefined>(
	((await caddyApiFetch("get", "@stacks/routes")) ?? [])
		.filter((route: any) => reviewPattern.test(route?.["@id"] ?? ""))
		.map((route: any) => [route["@id"], route.handle?.[0]?.portRangeId])
);
const reviewStacks = [...new Set([...swarmStacks, ...caddyStacks.keys()])].sort();

if (!reviewStacks.length) {
	info("No review stacks found.");
	Deno.exit(0);
}

const { GITHUB_TOKEN, GITHUB_REPOSITORY } = optional;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
	fatalError("cleanup needs GITHUB_TOKEN and GITHUB_REPOSITORY to check PR state; set them in the workflow env");
}

/** Whether the PR is closed, or null when GitHub couldn't say. */
async function isPrClosed(prNumber: number): Promise<boolean | null> {
	const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${prNumber}`, {
		headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json" }
	});
	if (!response.ok) {
		console.warn(`Could not read the state of PR #${prNumber} (${response.status} ${response.statusText}); only its age is checked.`);
		await response.body?.cancel();
		return null;
	}
	return (await response.json()).state !== "open";
}

/** Milliseconds since the stack's most recently updated service changed. */
async function stackAge(stack: string): Promise<number | null> {
	// UpdatedAt resets on redeploy, so an active stack keeps its clock refreshed.
	const serviceIds = (await $`docker stack services ${stack} --format "{{.ID}}"`.text()).split("\n").filter(Boolean);
	let newestUpdate = 0;
	for (const id of serviceIds) {
		const t = (await $`docker service inspect ${id} --format "{{.UpdatedAt}}"`.text()).trim();
		newestUpdate = Math.max(newestUpdate, new Date(t).getTime() || 0);
	}
	return newestUpdate ? Date.now() - newestUpdate : null;
}

let removed = 0;

for (const stack of reviewStacks) {
	const prNumber = Number(stack.match(reviewPattern)![1]);
	let isStale = await isPrClosed(prNumber) === true;
	// Age needs Swarm services; a Caddy-only leftover is judged by its PR alone.
	if (!isStale && maxAgeMs && swarmStacks.has(stack)) {
		const age = await stackAge(stack);
		isStale = age !== null && age > maxAgeMs;
	}
	if (!isStale) continue;

	info(`Removing stale review stack ${stack}...`);
	if (swarmStacks.has(stack)) await $`docker stack rm ${stack}`;
	if (caddyStacks.has(stack)) await removeCaddyConfig(stack, caddyStacks.get(stack));
	removed++;
}

info(`Done. Removed ${removed} stale review stack${removed === 1 ? "" : "s"}.`);
