import { stackTarget, ciMode } from "../constants.ts";
import { exists } from "@std/fs/exists";
import filterAsync from "../util/filterAsync.ts";
import prepareYmlFiles from "./prepareYmlFiles.ts";

// In CI, a cluster-specific overlay (`<cluster>.stack.yml`) replaces
// ci.stack.yml when it exists, so one repo can ship a different service set
// per cluster (e.g. a staging cluster swaps the real mail infra for a fake).
// Clusters without a dedicated file keep merging ci.stack.yml as before.
// "local" is excluded defensively: stack/config.ts defaults CLUSTER to
// "local" at import time, and this must never resolve to local.stack.yml
// in CI regardless of module evaluation order.
const cluster = Deno.env.get("CLUSTER");
const overlay = ciMode && cluster && cluster !== "local" && cluster !== stackTarget && await exists(`${cluster}.stack.yml`)
	? cluster
	: stackTarget;

const present = await filterAsync([
	"stack.yml",
	"stack.override.yml",
	`${overlay}.stack.yml`,
	`${overlay}.stack.override.yml`
], (f) => exists(f));

export default await prepareYmlFiles(present);
