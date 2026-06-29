import $ from "@david/dax";
import getServiceTag from "../stack/getServiceTag.ts";
import stack from "../stack/parsed.ts";
import fatalError from "../util/fatal.ts";

const service = Deno.args[1];
if (!service) fatalError("Usage: rig run <service> [args...]");

if (!stack.services?.[service]) fatalError(`Service "${service}" not found in stack`);

const args = Deno.args.slice(2);
const tag = getServiceTag(service);
const { code } = await $`docker run -it --rm -v ${Deno.cwd()}:/project ${tag} ${args}`.noThrow();
Deno.exit(code);
