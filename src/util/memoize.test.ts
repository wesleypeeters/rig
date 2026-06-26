import { assertEquals } from "@std/assert";
import memoize from "./memoize.ts";

Deno.test("calls the underlying function only once per distinct argument set", () => {
	let calls = 0;
	const m = memoize((a: number, b: number) => {
		calls++;
		return a + b;
	});
	assertEquals(m(1, 2), 3);
	assertEquals(m(1, 2), 3);
	assertEquals(calls, 1);
	assertEquals(m(2, 2), 4);
	assertEquals(calls, 2);
});

Deno.test("treats trailing undefined and null args as absent", () => {
	let calls = 0;
	const m = memoize((a: number, b?: number) => {
		calls++;
		return [a, b];
	});
	m(1);
	m(1, undefined);
	m(1, null as unknown as undefined);
	assertEquals(calls, 1);
});

Deno.test("honors a custom argument serializer", () => {
	let calls = 0;
	const m = memoize(
		(o: { id: number; label: string }) => {
			calls++;
			return o.id;
		},
		args => args[0].id,
	);
	m({ id: 5, label: "a" });
	m({ id: 5, label: "b" }); // same id -> cache hit despite a different label
	assertEquals(calls, 1);
	m({ id: 6, label: "c" });
	assertEquals(calls, 2);
});
