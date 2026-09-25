import $ from "@david/dax";
import getServiceTag from "../stack/getServiceTag.ts";
import stack from "../stack/parsed.ts";
import fatalError from "../util/fatal.ts";
import dockerTtyFlags from "../util/tty.ts";

const serviceName = Deno.args[1];
if (!serviceName) fatalError("Usage: rig run <service> [args...]");

const service = stack.services?.[serviceName];
if (!service) fatalError(`Service "${serviceName}" not found in stack`);

// A built service runs the image `rig build` tagged; any other runs its image as declared.
const image = service.build !== undefined ? getServiceTag(serviceName) : service.image;
const args = Deno.args.slice(2);
const { code } = await $`docker run ${dockerTtyFlags()} --rm -v ${Deno.cwd()}:/project -w /project ${image} ${args}`.noThrow();
Deno.exit(code);
