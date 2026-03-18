import $ from "@david/dax";
import id from "../stack/id.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig exec <service> <command...>");

const cmd = Deno.args.slice(2);
if (!cmd.length) fatalError("No command specified");

const containerId = (await $`docker ps --filter name=${id}_${service} --format "{{.ID}}"`.text()).trim().split("\n")[0];
if (!containerId) fatalError(`No running container found for ${service}`);
await $`docker exec -it ${containerId} ${cmd}`;
