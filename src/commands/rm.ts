import removeSwarmStack from "../stack/removeSwarmStack.ts";
import removeCaddyConfig from "../stack/removeCaddyConfig.ts";
import info from "../util/info.ts";
import { portRangeId } from "../stack/caddyVars.ts";
import id from "../stack/id.ts";

info(`Removing ${id} swarm stack... (if it exists)`);
await removeSwarmStack(id);
info(`Removing ${id} routes...`);
await removeCaddyConfig(id, portRangeId);
info("Done.");
