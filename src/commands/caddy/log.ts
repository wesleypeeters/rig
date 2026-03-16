import caddyApiFetch from "../../caddy/api.ts";
import info from "../../util/info.ts";

const level = Deno.args[2];
await caddyApiFetch("post", "@log/level", level);
info(`Log level set to ${level}`);
