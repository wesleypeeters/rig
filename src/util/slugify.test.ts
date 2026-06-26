import { assert, assertEquals } from "@std/assert";
import slugify from "./slugify.ts";

Deno.test("lowercases the ref", () => {
	assertEquals(slugify("Main"), "main");
	assertEquals(slugify("Feature/My-Branch"), "feature-my-branch");
});

Deno.test("collapses runs of non-alphanumerics into a single dash", () => {
	assertEquals(slugify("feature/foo_bar"), "feature-foo-bar");
	assertEquals(slugify("a@@@b"), "a-b");
	assertEquals(slugify("release-1.2.3"), "release-1-2-3");
});

Deno.test("trims leading and trailing dashes", () => {
	assertEquals(slugify("/foo/"), "foo");
	assertEquals(slugify("---foo---"), "foo");
});

Deno.test("preserves digits", () => {
	assertEquals(slugify("v2"), "v2");
});

Deno.test("truncates to 63 bytes", () => {
	const slug = slugify("a".repeat(70));
	assertEquals(slug.length, 63);
	assertEquals(slug, "a".repeat(63));
});

Deno.test("does not leave a trailing dash after truncation", () => {
	// The 63-byte cut lands on the dash, which must then be trimmed.
	const input = "a".repeat(62) + "-" + "b".repeat(10);
	const slug = slugify(input);
	assertEquals(slug, "a".repeat(62));
	assert(!slug.endsWith("-"));
});
