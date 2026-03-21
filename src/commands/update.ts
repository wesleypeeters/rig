import $ from "@david/dax";
import { rigDir } from "../constants.ts";
import info from "../util/info.ts";

info("Pulling latest changes...");
await $`git pull`.cwd(rigDir);
info("Installing...");
await $`deno task install`.cwd(rigDir);
const caddyDir = `${rigDir}/caddy`;
info("Building Caddy...");
await $`rig build`.cwd(caddyDir);
info("Deploying Caddy...");
await $`rig deploy`.cwd(caddyDir);
