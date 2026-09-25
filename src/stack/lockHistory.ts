import { exists } from "@std/fs/exists";
import lockFilePath, { historyDir, historyLength } from "./lockfile.ts";

/** Entries oldest first. Names are sortable timestamps. */
export async function listHistory(): Promise<string[]> {
	if (!(await exists(historyDir))) return [];
	const names: string[] = [];
	for await (const entry of Deno.readDir(historyDir)) {
		if (entry.isFile && entry.name.endsWith(".json")) names.push(entry.name.slice(0, -5));
	}
	return names.sort();
}

/**
 * Move the current lockfile into the history before a build replaces it, unless
 * the new one is identical. Keeps the newest `historyLength` entries.
 */
export async function archiveLockfile(next: string) {
	if (!(await exists(lockFilePath))) return;
	const current = await Deno.readTextFile(lockFilePath);
	if (current === next) return;
	await Deno.mkdir(historyDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	await Deno.writeTextFile(`${historyDir}/${stamp}.json`, current);
	const entries = await listHistory();
	for (const name of entries.slice(0, Math.max(0, entries.length - historyLength))) {
		await Deno.remove(`${historyDir}/${name}.json`);
	}
}
