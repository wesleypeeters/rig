import $ from "@david/dax";
import fatalError from "../util/fatal.ts";

const name = Deno.args[1];
if (!name) fatalError("Usage: rig network <name>");

await $`docker network create --driver overlay --scope swarm --attachable ${name}`;
