import { fromFileUrl } from "@std/path";

export const
	awaitMode = Deno.args[1] === "await",
	ciMode = Deno.env.get("CI") === "true",
	stackTarget = ciMode ? "ci" : "local",
	rigDir = fromFileUrl(new URL("..", import.meta.url)).replace(/\/$/, ""),
	outDir = ".rig";
