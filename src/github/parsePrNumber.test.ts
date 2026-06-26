import { assertEquals } from "@std/assert";
import parsePrNumber from "./parsePrNumber.ts";

Deno.test("reads the number from a pull_request event", () => {
	assertEquals(parsePrNumber({ pull_request: { number: 7 } }), 7);
});

Deno.test("falls back to the refs/pull/<n>/merge ref", () => {
	assertEquals(parsePrNumber({}, "refs/pull/42/merge"), 42);
});

Deno.test("falls back to a workflow_dispatch input", () => {
	assertEquals(parsePrNumber({ inputs: { pr_number: "13" } }), 13);
});

Deno.test("prefers the event payload over the ref", () => {
	assertEquals(parsePrNumber({ pull_request: { number: 1 } }, "refs/pull/99/merge"), 1);
});

Deno.test("ignores a non-merge ref", () => {
	assertEquals(parsePrNumber({}, "refs/heads/main"), null);
});

Deno.test("returns null for a push build with no PR signal", () => {
	assertEquals(parsePrNumber({}), null);
});
