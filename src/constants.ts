export const
	awaitMode = Deno.args[1] === "await",
	ciMode = Deno.env.get("CI") === "true",
	stackTarget = ciMode ? "ci" : "local",
	rigDir = import.meta.resolve("./..").slice(7, -1),
	outDir = ".rig";
