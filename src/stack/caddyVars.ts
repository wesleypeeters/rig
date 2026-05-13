import caddyApiFetch from "../caddy/api.ts";
import { optional } from "../util/env.ts";
import id from "./id.ts";
import fatalError from "../util/fatal.ts";

const caddyStackVars: { repository?: string, directory?: string, portRangeId?: number } = id === "caddy" ? {} : await caddyApiFetch("get", `${id}/handle/0`);
export const stackExists = caddyStackVars !== undefined;
const { repository, directory, portRangeId } = caddyStackVars || {};
export { portRangeId };
// Prevent conflicts between stacks from different repos that share the same name.
if (repository && repository !== optional.GITHUB_REPOSITORY) fatalError(`This stack belongs to ${repository}`);
// Prevent accidental cross-clone deploys: same stack name from a different working directory.
if (directory && directory !== Deno.cwd() && !optional.RIG_FORCE_DIR) {
	fatalError(`Stack ${id} was last deployed from ${directory}, not ${Deno.cwd()}.\nSet RIG_FORCE_DIR=1 to override.`);
}
