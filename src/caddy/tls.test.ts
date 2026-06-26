import { assertEquals } from "@std/assert";
import { defaultOnDemandInternalSubjects, generateSubjectWildcards } from "./tls.ts";

Deno.test("builds one wildcard per level, growing left", () => {
	assertEquals(generateSubjectWildcards("localhost", 1), ["*.localhost"]);
	assertEquals(generateSubjectWildcards("localhost", 2), ["*.localhost", "*.*.localhost"]);
	assertEquals(generateSubjectWildcards("example.com", 3), [
		"*.example.com",
		"*.*.example.com",
		"*.*.*.example.com",
	]);
});

Deno.test("returns nothing for zero levels", () => {
	assertEquals(generateSubjectWildcards("localhost", 0), []);
});

Deno.test("the default internal subjects cover ten levels under localhost", () => {
	assertEquals(defaultOnDemandInternalSubjects.length, 10);
	assertEquals(defaultOnDemandInternalSubjects[0], "*.localhost");
	assertEquals(defaultOnDemandInternalSubjects.at(-1), "*.".repeat(10) + "localhost");
});
