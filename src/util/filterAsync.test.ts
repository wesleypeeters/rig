import { assertEquals } from "@std/assert";
import filterAsync from "./filterAsync.ts";

Deno.test("keeps the items whose async predicate resolves truthy", async () => {
	const result = await filterAsync([1, 2, 3, 4], n => Promise.resolve(n % 2 === 0));
	assertEquals(result, [2, 4]);
});

Deno.test("preserves the original order", async () => {
	const result = await filterAsync(["a", "b", "c"], s => Promise.resolve(s !== "b"));
	assertEquals(result, ["a", "c"]);
});

Deno.test("passes value, index and array to the predicate", async () => {
	const seen: Array<[string, number]> = [];
	await filterAsync(["x", "y"], (value, index) => {
		seen.push([value, index]);
		return Promise.resolve(true);
	});
	assertEquals(seen, [["x", 0], ["y", 1]]);
});

Deno.test("handles an empty array", async () => {
	assertEquals(await filterAsync([], () => Promise.resolve(true)), []);
});
