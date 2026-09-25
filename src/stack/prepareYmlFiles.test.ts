import { assertEquals } from "@std/assert";
import { absolutizeServicePaths } from "./prepareYmlFiles.ts";

Deno.test("rewrites the paths compose resolves against the file's directory", () => {
	const services: any = {
		a: { env_file: "./a.env", build: "." },
		b: { env_file: ["b.env", { path: "./c.env", required: false }], build: { context: "api", dockerfile: "Dockerfile" } },
		c: { extends: { file: "../base.yml", service: "x" } }
	};
	absolutizeServicePaths(services, "/repo");
	assertEquals(services, {
		a: { env_file: "/repo/a.env", build: "/repo" },
		b: { env_file: ["/repo/b.env", { path: "/repo/c.env", required: false }], build: { context: "/repo/api", dockerfile: "Dockerfile" } },
		c: { extends: { file: "/base.yml", service: "x" } }
	});
});

Deno.test("leaves absolute paths and remote build contexts alone", () => {
	const services: any = {
		a: { env_file: "/etc/app.env", build: "https://github.com/o/r.git#main" },
		b: { build: { context: "git@github.com:o/r.git" } },
		c: { image: "nginx" }
	};
	const before = structuredClone(services);
	absolutizeServicePaths(services, "/repo");
	assertEquals(services, before);
});
