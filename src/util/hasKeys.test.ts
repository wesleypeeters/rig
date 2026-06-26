import { assertEquals } from "@std/assert";
import hasKeys from "./hasKeys.ts";

Deno.test("is false for an empty object", () => {
	assertEquals(hasKeys({}), false);
});

Deno.test("is true for an object with own properties", () => {
	assertEquals(hasKeys({ a: 1 }), true);
});

Deno.test("treats arrays by their indices", () => {
	assertEquals(hasKeys([]), false);
	assertEquals(hasKeys([1]), true);
});
