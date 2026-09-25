import { assertEquals } from "@std/assert";
import { parseImageReference } from "./registry.ts";

Deno.test("Docker Hub official and user images", () => {
	assertEquals(parseImageReference("postgres:16"), { host: "registry-1.docker.io", name: "library/postgres", tag: "16" });
	assertEquals(parseImageReference("nginx"), { host: "registry-1.docker.io", name: "library/nginx", tag: "latest" });
	assertEquals(parseImageReference("bitnami/redis:7.2"), { host: "registry-1.docker.io", name: "bitnami/redis", tag: "7.2" });
	assertEquals(parseImageReference("docker.io/library/nginx:1"), { host: "registry-1.docker.io", name: "library/nginx", tag: "1" });
	assertEquals(parseImageReference("docker.io/nginx"), { host: "registry-1.docker.io", name: "library/nginx", tag: "latest" });
});

Deno.test("registries named by a dot", () => {
	assertEquals(parseImageReference("ghcr.io/owner/app:main"), { host: "ghcr.io", name: "owner/app", tag: "main" });
	assertEquals(parseImageReference("ghcr.io/owner/app"), { host: "ghcr.io", name: "owner/app", tag: "latest" });
});

Deno.test("registries with a port, and localhost", () => {
	assertEquals(parseImageReference("registry.example.com:5000/team/app:v2"), { host: "registry.example.com:5000", name: "team/app", tag: "v2" });
	assertEquals(parseImageReference("localhost:5000/app"), { host: "localhost:5000", name: "app", tag: "latest" });
	assertEquals(parseImageReference("localhost/app:x"), { host: "localhost", name: "app", tag: "x" });
});
