import { assertEquals } from "@std/assert";
import { fetchExtraSubjects } from "./syncPublicSubjects.ts";

/**
 * The allowlist is a security boundary, not a convenience: an on-demand policy
 * with no subjects matches every SNI, and a scanner spraying hostnames then
 * exhausts the ACME account's new-orders limit. These tests pin the two
 * properties that keep it one — inert when unconfigured, and never able to
 * widen the policy through its own input.
 */

function withFetch(impl: typeof fetch, run: () => Promise<void>) {
	const original = globalThis.fetch;
	globalThis.fetch = impl;
	return run().finally(() => {
		globalThis.fetch = original;
	});
}

const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body)));

Deno.test("is inert when no url is configured", async () => {
	// The whole point: a cluster that does not use this behaves as before.
	await withFetch(() => Promise.reject(new Error("must not be called")), async () => {
		assertEquals(await fetchExtraSubjects(undefined), []);
		assertEquals(await fetchExtraSubjects(null), []);
		assertEquals(await fetchExtraSubjects(""), []);
	});
});

Deno.test("refuses a non-https url", async () => {
	await withFetch(() => Promise.reject(new Error("must not be called")), async () => {
		assertEquals(await fetchExtraSubjects("http://insecure.example/subjects"), []);
	});
});

Deno.test("returns the hostnames an application vouches for", async () => {
	await withFetch(ok({ subjects: ["cdn.example.nl", "cdn.example.co.uk"] }), async () => {
		assertEquals(
			await fetchExtraSubjects("https://api.example/subjects"),
			["cdn.example.nl", "cdn.example.co.uk"],
		);
	});
});

Deno.test("rejects entries that would widen the policy", async () => {
	// A wildcard or a path in the list would be a way to reopen the match-all
	// behaviour through the back door.
	await withFetch(
		ok({ subjects: ["*.example.nl", "cdn.example.nl/path", "not a host", "", "cdn.good.nl"] }),
		async () => {
			assertEquals(await fetchExtraSubjects("https://api.example/subjects"), ["cdn.good.nl"]);
		},
	);
});

Deno.test("yields nothing rather than something wrong on a bad response", async () => {
	// Every one of these must leave the deploy-derived list unchanged.
	await withFetch(() => Promise.resolve(new Response("", { status: 500 })), async () => {
		assertEquals(await fetchExtraSubjects("https://api.example/subjects"), []);
	});
	await withFetch(() => Promise.resolve(new Response("not json")), async () => {
		assertEquals(await fetchExtraSubjects("https://api.example/subjects"), []);
	});
	await withFetch(ok({ subjects: "not-an-array" }), async () => {
		assertEquals(await fetchExtraSubjects("https://api.example/subjects"), []);
	});
	await withFetch(ok({}), async () => {
		assertEquals(await fetchExtraSubjects("https://api.example/subjects"), []);
	});
	await withFetch(() => Promise.reject(new Error("network down")), async () => {
		assertEquals(await fetchExtraSubjects("https://api.example/subjects"), []);
	});
});

Deno.test("caps the list so a compromised endpoint cannot flood it", async () => {
	const many = Array.from({ length: 2500 }, (_, i) => `cdn.d${i}.nl`);
	await withFetch(ok({ subjects: many }), async () => {
		assertEquals((await fetchExtraSubjects("https://api.example/subjects")).length, 2000);
	});
});
