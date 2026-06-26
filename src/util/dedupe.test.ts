import { assertEquals } from "@std/assert";
import dedupe from "./dedupe.ts";

Deno.test("removes duplicates", () => {
	assertEquals(dedupe([1, 1, 2, 3, 3, 3]), [1, 2, 3]);
});

Deno.test("preserves first-seen order", () => {
	assertEquals(dedupe(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
});

Deno.test("leaves an already-unique array untouched", () => {
	assertEquals(dedupe([1, 2, 3]), [1, 2, 3]);
});

Deno.test("handles an empty array", () => {
	assertEquals(dedupe([]), []);
});
