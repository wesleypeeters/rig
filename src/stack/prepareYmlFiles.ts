import { ensureDir } from "@std/fs";
import { join, basename, resolve, isAbsolute } from "@std/path";
import { parse, stringify } from "@std/yaml";
import fatalError from "../util/fatal.ts";
import { outDir } from "../constants.ts";
import type { Stack, FileRef } from "./types.ts";

const SECRETS_DIR = `${outDir}/secrets`;
const PREPARED_DIR = `${outDir}/prepared`;

/**
 * Resolve `x-rig-env` entries in each input YAML before they reach `docker
 * stack config`. For every secret or config with `x-rig-env: SOME_VAR`:
 *   - env var set with a value: write the value to .rig/secrets/, rewrite
 *     `file:` to that path, drop `x-rig-env`.
 *   - env var set but empty: fatal (misconfiguration).
 *   - env var unset: leave the entry alone. Compose merges against any
 *     `file:` fallback in this or another layer. Deploy-time checks (in
 *     deploy.ts) fatal in CI mode if anything is still unresolved.
 *
 * Returns the list of file paths to feed to compose (rewritten temp paths
 * when at least one entry was materialized, or the originals otherwise).
 */
export default async function prepareYmlFiles(files: string[]): Promise<string[]> {
	const docs: { path: string; doc: Stack }[] = [];
	let needsRewrite = false;
	for (const path of files) {
		const doc = parse(await Deno.readTextFile(path)) as Stack;
		docs.push({ path, doc });
		if (hasRigEnv(doc.secrets) || hasRigEnv(doc.configs)) needsRewrite = true;
	}
	if (!needsRewrite) return files;

	await Promise.all([ensureDir(SECRETS_DIR), ensureDir(PREPARED_DIR)]);

	return Promise.all(docs.map(async ({ path, doc }) => {
		await materializeRefs(doc.secrets);
		await materializeRefs(doc.configs);
		absolutizeRefs(doc.secrets);
		absolutizeRefs(doc.configs);
		const out = join(PREPARED_DIR, basename(path));
		await Deno.writeTextFile(out, stringify(doc));
		return out;
	}));
}

// Make every file: path absolute. The prepared YAMLs live in a different
// directory than the originals, so compose would resolve relative paths from
// the wrong base.
function absolutizeRefs(refs?: Record<string, FileRef>) {
	if (!refs) return;
	for (const f of Object.values(refs)) {
		if (f.file && !isAbsolute(f.file)) f.file = resolve(f.file);
	}
}

function hasRigEnv(refs?: Record<string, FileRef>) {
	return !!refs && Object.values(refs).some(f => f["x-rig-env"] !== undefined);
}

async function materializeRefs(refs?: Record<string, FileRef>) {
	if (!refs) return;
	await Promise.all(Object.values(refs).map(async f => {
		const key = f["x-rig-env"];
		if (key === undefined) return;
		const value = Deno.env.get(key);
		if (value === undefined) return;
		if (value === "") return fatalError(`x-rig-env refers to env var ${key} which is set but empty`);
		const path = join(SECRETS_DIR, key.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
		await Deno.writeTextFile(path, value);
		f.file = await Deno.realPath(path);
		delete f["x-rig-env"];
	}));
}
