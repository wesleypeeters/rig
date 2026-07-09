import caddyApiFetch from "../caddy/api.ts";
import { optional } from "../util/env.ts";
import { ciMode } from "../constants.ts";
import id from "./id.ts";
import fatalError from "../util/fatal.ts";

const caddyStackVars: { repository?: string, directory?: string, portRangeId?: number, portAssignments?: Record<string, number> } = id === "caddy" ? {} : await caddyApiFetch("get", `${id}/handle/0`);
export const stackExists = caddyStackVars !== undefined;
const { repository, directory, portRangeId, portAssignments } = caddyStackVars || {};
export { portRangeId, portAssignments };
// Prevent conflicts between stacks from different repos that share the same name.
if (repository && repository !== optional.GITHUB_REPOSITORY) fatalError(`This stack belongs to ${repository}`);
// Prevent accidental cross-clone deploys: same stack name from a different
// working directory. Local mode only — CI workdirs are machine-managed and
// move whenever the runner is renamed/rebuilt, and the repository check above
// already pins the stack's identity there.
if (!ciMode && directory && directory !== Deno.cwd() && !optional.RIG_FORCE_DIR) {
	fatalError(`Stack ${id} was last deployed from ${directory}, not ${Deno.cwd()}.\nSet RIG_FORCE_DIR=1 to override.`);
}
