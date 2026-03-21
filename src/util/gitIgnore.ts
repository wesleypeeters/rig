import { exists } from "@std/fs/exists";
import $ from "@david/dax";

export default async function (...ignoreLines: string[]) {
	const gitIgnoreFilename = ".gitignore";
	if (await exists(gitIgnoreFilename)) {
		const lines = new Set((await Deno.readTextFile(gitIgnoreFilename)).split("\n"));
		ignoreLines = [...new Set(ignoreLines).difference(lines)];
	}
	if (ignoreLines.length) {
		const content = await exists(gitIgnoreFilename) ? await Deno.readTextFile(gitIgnoreFilename) : "";
		const prefix = content.length && !content.endsWith("\n") ? "\n" : "";
		await Deno.writeTextFile(gitIgnoreFilename, `${prefix}${ignoreLines.join("\n")}\n`, { create: true, append: true });
		$`git add ${gitIgnoreFilename}`;
	}
}
