import $ from "@david/dax";
import interleave from "../util/interleave.ts";
import fatalError from "../util/fatal.ts";
import { prNumber } from "../github/pr.ts";
import { optional } from "../util/env.ts";
import { stackTarget as STACK_TARGET } from "../constants.ts";

const { CLUSTER = "local", CLUSTER_TLD = ".localhost", STACK_REVIEW_ID = prNumber === null ? "" : String(prNumber) } = optional;

Object.entries({
	TIMESTAMP: new Date().toISOString(),
	CLUSTER,
	CLUSTER_TLD,
	STACK_REVIEW_ID,
	STACK_HOST_SUFFIX: `${STACK_REVIEW_ID ? `.r${STACK_REVIEW_ID}` : ""}${CLUSTER_TLD}`,
	STACK_TARGET
}).forEach(([key, value]) => {
	Deno.env.set(key, value);
});

export default function (ymlFiles: string[], interpolate = true) {
	if (!ymlFiles.length) fatalError("Couldn't find stack file(s)");
	const interpolation = interpolate ? "" : "--skip-interpolation";
	return $`docker stack config ${$.rawArg(interpolation)} ${interleave(ymlFiles, "-c")}`.text();
}
