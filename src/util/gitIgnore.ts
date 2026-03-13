import { exists } from "@std/fs/exists";
import $ from "@david/dax";

export default async function (...ignoreLines: string[]) {
	const gitIgnoreFilename = ".gitignore";
	if (await exists(gitIgnoreFilename)) {
		const lines = new Set((await Deno.readTextFile(gitIgnoreFilename)).split("\n"));
		ignoreLines = [...new Set(ignoreLines).difference(lines)];
	}
	if (ignoreLines.length) {
		await Deno.writeTextFile(gitIgnoreFilename, ignoreLines.join("\n"), { create: true, append: true });
		$`git add ${gitIgnoreFilename}`;
	}
}
