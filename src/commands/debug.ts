import $ from "@david/dax";
import id from "../stack/id.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig debug <service>");

const containerId = (await $`docker ps --filter name=${id}_${service} --format "{{.ID}}"`.text()).trim().split("\n")[0];
if (!containerId) fatalError(`No running container found for ${service}`);
await $`docker debug ${containerId}`;
