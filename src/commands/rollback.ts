import { outDir } from "../constants.ts";
import lockFilePath from "../stack/lockfile.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

// Find the --to flag or use the previous lockfile.
const toArg = Deno.args.find(a => a.startsWith("--to="));

if (toArg) {
	const target = `${outDir}/${toArg.split("=")[1]}.json`;
	try {
		await Deno.copyFile(target, lockFilePath);
		info(`Rolled back to ${target}`);
	} catch {
		fatalError(`Lockfile not found: ${target}`);
	}
} else {
	// List lockfiles sorted by modification time, pick the second most recent.
	const files: { name: string; mtime: number }[] = [];
	for await (const entry of Deno.readDir(outDir)) {
		if (!entry.name.endsWith(".json")) continue;
		const stat = await Deno.stat(`${outDir}/${entry.name}`);
		files.push({ name: entry.name, mtime: stat.mtime?.getTime() ?? 0 });
	}
	files.sort((a, b) => b.mtime - a.mtime);
	if (files.length < 2) fatalError("No previous lockfile to roll back to");
	const previous = `${outDir}/${files[1].name}`;
	await Deno.copyFile(previous, lockFilePath);
	info(`Rolled back to ${previous}`);
}

info("Run 'rig deploy' to apply the rollback.");
