import caddyApiFetch from "../caddy/api.ts";
import fatalError from "../util/fatal.ts";

const stack = Deno.args[1];
if (!stack) fatalError("Usage: rig dir <stack>");

const vars = await caddyApiFetch("get", `${stack}/handle/0`);
if (!vars) fatalError(`Stack "${stack}" not deployed`);
if (!vars.directory) fatalError(`No directory recorded for stack "${stack}"`);
console.log(vars.directory);
