import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import fatalError from "../util/fatal.ts";
import { FileRef } from "./types.ts";

const SECRETS_DIR = ".rig/secrets";

/**
 * Materialize env-sourced secrets and configs into temp files.
 *
 * When a secret or config declares `x-rig-env: SOME_VAR`, rig reads the env var
 * at deploy time, writes the value to `.rig/secrets/`, and rewrites `file:` to
 * point there. This lets CI pass secret values through GitHub environment
 * secrets (which are env vars, not files) without pre-placing files on the
 * cluster.
 *
 * Fatals if `x-rig-env` is set but the env var is missing or empty -- the
 * intent is to fail the deploy loudly on misconfiguration.
 */
export default async function (files: FileRef[]): Promise<void> {
	const envFiles = files.filter(f => f["x-rig-env"] !== undefined);
	if (!envFiles.length) return;
	await ensureDir(SECRETS_DIR);
	await Promise.all(envFiles.map(async f => {
		const key = f["x-rig-env"]!;
		const value = Deno.env.get(key);
		if (!value) return fatalError(`x-rig-env refers to env var ${key} which is missing or empty`);
		const path = join(SECRETS_DIR, key.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
		await Deno.writeTextFile(path, value);
		f.file = path;
		delete f["x-rig-env"];
	}));
}
