import { exists } from "@std/fs/exists";

/** Append lines to ./.gitignore that it doesn't already contain. */
export default async function (...ignoreLines: string[]) {
	const gitIgnoreFilename = ".gitignore";
	const content = await exists(gitIgnoreFilename) ? await Deno.readTextFile(gitIgnoreFilename) : "";
	const present = new Set(content.split("\n").map(line => line.trim().replace(/^\/|\/$/g, "")));
	const missing = [...new Set(ignoreLines)].filter(line => !present.has(line));
	if (!missing.length) return;
	const prefix = content.length && !content.endsWith("\n") ? "\n" : "";
	await Deno.writeTextFile(gitIgnoreFilename, `${prefix}${missing.join("\n")}\n`, { append: true });
}
