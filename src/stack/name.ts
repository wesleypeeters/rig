import { resolve } from "@std/path";
import fatalError from "../util/fatal.ts";
import { rigDir } from "../constants.ts";
import parsed from "./parsed.ts";

const { name } = parsed["x-rig"] || {};
if (typeof name !== "string") fatalError("No stack name specified");
if (/_r\d+$/.test(name)) fatalError("Stack name conflicts with review environment naming pattern");
// A stack's name is its @id in Caddy's config, which it shares with rig's own
// objects and with the numeric ids of claimed port ranges.
if (name === "localhost" || name.startsWith("@") || /^\d+$/.test(name)) fatalError(`Stack name ${JSON.stringify(name)} is reserved`);
// "caddy" is the cluster's proxy, which rig treats specially (no routes of its
// own, exempt from CI governance), so only rig's own caddy/ directory may use it.
if (name === "caddy" && await realPath(Deno.cwd()) !== await realPath(resolve(rigDir, "caddy"))) {
	fatalError(`Stack name "caddy" is reserved for rig's proxy, deployed from ${resolve(rigDir, "caddy")}`);
}

function realPath(path: string) {
	return Deno.realPath(path).catch(() => path);
}

export default name;
