import { assertEquals } from "@std/assert";
import buildStripRegex from "./stripRegex.ts";

Deno.test("strips a simple non-host TLD literally", () => {
	assertEquals(buildStripRegex(".test"), "(.+)\\.test$");
	assertEquals(buildStripRegex(".dev"), "(.+)\\.dev$");
});

Deno.test("escapes the dots in a multi-label TLD", () => {
	assertEquals(buildStripRegex(".dev.example.com"), "(.+)\\.dev\\.example\\.com$");
});

Deno.test("uses a loose matcher for any *host TLD", () => {
	assertEquals(buildStripRegex(".devhost"), "(.+)\\.\\w*host$");
	// .localhost ends in "host" too, so it takes the same loose path -- which
	// still strips app.localhost correctly via \w*host.
	assertEquals(buildStripRegex(".localhost"), "(.+)\\.\\w*host$");
});
