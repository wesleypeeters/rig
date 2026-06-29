import $ from "@david/dax";
import findContainer from "../stack/findContainer.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig debug <service>");

const { containerId, dockerHost } = await findContainer(service);
if (dockerHost) Deno.env.set("DOCKER_HOST", dockerHost);
const { code } = await $`docker debug ${containerId}`.noThrow();
Deno.exit(code);
