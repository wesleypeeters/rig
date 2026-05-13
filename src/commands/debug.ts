import $ from "@david/dax";
import findContainer from "../stack/findContainer.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig debug <service>");

const containerId = await findContainer(service);
await $`docker debug ${containerId}`;
