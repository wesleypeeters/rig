import $ from "@david/dax";
import findContainer from "../stack/findContainer.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig exec <service> <command...>");

const cmd = Deno.args.slice(2);
if (!cmd.length) fatalError("No command specified");

const { containerId, dockerHost } = await findContainer(service);
if (dockerHost) Deno.env.set("DOCKER_HOST", dockerHost);
// noThrow + propagate the exit code: a non-zero command (or `exit 1` from a
// shell) should set rig's exit code, not dump a dax stack trace.
const { code } = await $`docker exec -it ${containerId} ${cmd}`.noThrow();
Deno.exit(code);
