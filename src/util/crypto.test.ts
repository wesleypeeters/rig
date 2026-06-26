import { assert, assertEquals } from "@std/assert";
import hashFile from "./crypto.ts";

async function withTempFile(content: string, fn: (path: string) => Promise<void>) {
	const path = await Deno.makeTempFile();
	try {
		await Deno.writeTextFile(path, content);
		await fn(path);
	} finally {
		await Deno.remove(path);
	}
}

Deno.test("is deterministic for identical content", async () => {
	await withTempFile("hello rig", async a => {
		await withTempFile("hello rig", async b => {
			assertEquals(await hashFile(a), await hashFile(b));
		});
	});
});

Deno.test("differs when content differs", async () => {
	await withTempFile("hello rig", async a => {
		await withTempFile("hello rig!", async b => {
			assert(await hashFile(a) !== await hashFile(b));
		});
	});
});

Deno.test("returns a non-empty base58 string", async () => {
	await withTempFile("x", async path => {
		const hash = await hashFile(path);
		assert(hash.length > 0);
		assert(/^[1-9A-HJ-NP-Za-km-z]+$/.test(hash), `not base58: ${hash}`);
	});
});
