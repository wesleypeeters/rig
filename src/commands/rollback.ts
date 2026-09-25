import lockFilePath, { historyDir } from "../stack/lockfile.ts";
import { listHistory } from "../stack/lockHistory.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

// `rig build` moves the lockfile it replaces into the history. Rolling back
// restores an entry and drops it and everything newer, so the history stays a
// straight line: rolling back twice goes back two builds, and building again
// is how you go forward.
const entries = await listHistory();

if (Deno.args.includes("--list")) {
	if (!entries.length) info("No earlier lockfiles.");
	entries.toReversed().forEach(name => console.log(name));
	Deno.exit(0);
}

const toArg = Deno.args.find(a => a.startsWith("--to="))?.slice(5);
const target = toArg ?? entries.at(-1);
if (!target) fatalError(`No earlier lockfile to roll back to (nothing in ${historyDir})`);
if (!entries.includes(target)) fatalError(`No lockfile ${target} in ${historyDir}. See rig rollback --list.`);

await Deno.copyFile(`${historyDir}/${target}.json`, lockFilePath);
for (const name of entries.slice(entries.indexOf(target))) await Deno.remove(`${historyDir}/${name}.json`);
info(`Rolled back to the lockfile from ${target}.`);
info("Run 'rig deploy' to apply the rollback.");
