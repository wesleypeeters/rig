import caddyApiFetch from "../../caddy/api.ts";
import fatalError from "../../util/fatal.ts";
import info from "../../util/info.ts";

const levels = ["DEBUG", "INFO", "WARN", "ERROR"];
const level = Deno.args[2]?.toUpperCase();
if (!level || !levels.includes(level)) fatalError(`Usage: rig caddy log <${levels.join("|")}>`);

await caddyApiFetch("post", "@log/level", level);
info(`Log level set to ${level}`);
