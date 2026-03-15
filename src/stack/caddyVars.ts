import caddyApiFetch from "../caddy/api.ts";
import { optional } from "../util/env.ts";
import id from "./id.ts";
import fatalError from "../util/fatal.ts";

const caddyStackVars: { repository?: string, portRangeId?: number } = id === "caddy" ? {} : await caddyApiFetch("get", `${id}/handle/0`);
export const stackExists = caddyStackVars !== undefined;
const { repository, portRangeId } = caddyStackVars || {};
export { portRangeId };
// Prevent conflicts between stacks from different repos that share the same name.
if (repository && repository !== optional.GITHUB_REPOSITORY) fatalError(`This stack belongs to ${repository}`);
