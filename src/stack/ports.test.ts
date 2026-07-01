import { assertEquals } from "@std/assert";
import { assignPortOffsets } from "./ports.ts";

Deno.test("first deploy assigns sequential offsets in order", () => {
	const offsets = assignPortOffsets(["frontend:80", "backend:8000", "reverb:8080"]);
	assertEquals(offsets, { "frontend:80": 0, "backend:8000": 1, "reverb:8080": 2 });
});

Deno.test("adding a route keeps existing offsets and gives the new one the next free slot", () => {
	const stored = { "frontend:80": 0, "backend:8000": 1, "reverb:8080": 2, "mailpit:8025": 3 };
	// The `admin` route is inserted in the MIDDLE of the array — the previous bug
	// renumbered everything after it (causing the Swarm ingress-port collision).
	const offsets = assignPortOffsets(
		["frontend:80", "backend:8000", "admin:8000", "reverb:8080", "mailpit:8025"],
		stored,
	);
	assertEquals(offsets["frontend:80"], 0);
	assertEquals(offsets["backend:8000"], 1);
	assertEquals(offsets["reverb:8080"], 2);
	assertEquals(offsets["mailpit:8025"], 3);
	assertEquals(offsets["admin:8000"], 4); // lowest free slot, nobody else moved
});

Deno.test("array order does not affect preserved offsets", () => {
	const stored = { "a:80": 0, "b:80": 1, "c:80": 2 };
	const offsets = assignPortOffsets(["c:80", "a:80", "b:80"], stored);
	assertEquals(offsets, { "a:80": 0, "b:80": 1, "c:80": 2 });
});

Deno.test("a removed service frees its slot for the lowest new claimant", () => {
	const stored = { "a:80": 0, "b:80": 1, "c:80": 2 };
	// `b` removed, `d` added — d takes the freed slot 1, a and c stay put.
	const offsets = assignPortOffsets(["a:80", "c:80", "d:80"], stored);
	assertEquals(offsets["a:80"], 0);
	assertEquals(offsets["c:80"], 2);
	assertEquals(offsets["d:80"], 1);
});

Deno.test("out-of-range or duplicated stored offsets are reassigned", () => {
	const stored = { "a:80": 99, "b:80": 1, "c:80": 1 };
	const offsets = assignPortOffsets(["a:80", "b:80", "c:80"], stored);
	assertEquals(offsets["b:80"], 1); // valid, preserved
	assertEquals(offsets["a:80"], 0); // 99 out of range -> lowest free
	assertEquals(offsets["c:80"], 2); // duplicate of b's slot -> next free
});

Deno.test("no routes yields an empty map", () => {
	assertEquals(assignPortOffsets([]), {});
});
