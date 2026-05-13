import $ from "@david/dax";
import findContainer from "../stack/findContainer.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig exec <service> <command...>");

const cmd = Deno.args.slice(2);
if (!cmd.length) fatalError("No command specified");

const { containerId, dockerHost } = await findContainer(service);
if (dockerHost) Deno.env.set("DOCKER_HOST", dockerHost);
await $`docker exec -it ${containerId} ${cmd}`;
