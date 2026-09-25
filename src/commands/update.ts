import $ from "@david/dax";
import { rigDir } from "../constants.ts";
import info from "../util/info.ts";

info("Pulling latest changes...");
await $`git pull`.cwd(rigDir);
info("Installing...");
await $`deno task install`.cwd(rigDir);
const caddyDir = `${rigDir}/caddy`;
// The Caddy image stays on this machine: build it outside CI mode, which would
// push it. The deploy inherits CI=true on a cluster, so ci.stack.yml applies.
info("Building Caddy...");
await $`rig build`.cwd(caddyDir).env("CI", "false");
info("Deploying Caddy...");
await $`rig deploy`.cwd(caddyDir);
