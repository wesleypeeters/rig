import { basename } from "@std/path";
import createFileHash from "../util/crypto.ts";
import memoize from "../util/memoize.ts";
import { FileRef } from "./types.ts";

const getFileHash = memoize(createFileHash);

/**
 * Include file digests in filenames so Docker Swarm allows updates.
 * The prefix prevents name collisions between stacks on the same cluster.
 */
export default async function (files: FileRef[], prefix: string = "") {
	await Promise.all(files.map(async f => f.name = `${prefix}${(await getFileHash(await Deno.realPath(f.file))).slice(0, 11)}.${basename(f.file)}`));
}
