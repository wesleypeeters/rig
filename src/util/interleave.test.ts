import { assertEquals } from "@std/assert";
import interleave from "./interleave.ts";

Deno.test("inserts the separator before every item", () => {
	assertEquals(interleave([1, 2, 3], 0), [0, 1, 0, 2, 0, 3]);
});

Deno.test("leads with the separator for a single item", () => {
	assertEquals(interleave(["a"], "-"), ["-", "a"]);
});

Deno.test("returns an empty array for empty input", () => {
	assertEquals(interleave([], 0), []);
});
