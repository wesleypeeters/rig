import { assertEquals } from "@std/assert";
import getCanonicalHost from "./getCanonicalHost.ts";

Deno.test("fills in the default http port", () => {
	assertEquals(getCanonicalHost(new URL("http://foo")), "foo:80");
});

Deno.test("fills in the default https port", () => {
	assertEquals(getCanonicalHost(new URL("https://foo")), "foo:443");
});

Deno.test("keeps an explicit port", () => {
	assertEquals(getCanonicalHost(new URL("http://foo:3000")), "foo:3000");
	assertEquals(getCanonicalHost(new URL("https://foo:8443")), "foo:8443");
});

Deno.test("canonicalizes even when the explicit port is the default", () => {
	// URL drops a default port from .host, which is the whole reason this helper exists.
	assertEquals(getCanonicalHost(new URL("https://foo:443")), "foo:443");
	assertEquals(getCanonicalHost(new URL("http://foo:80")), "foo:80");
});
