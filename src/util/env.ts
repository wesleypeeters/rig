import fatalError from "./fatal.ts";

const { env } = Deno;

export const optional = new Proxy({} as Record<string, string | undefined>, {
	get(_, name: string) {
		return env.get(name);
	}
});

export const mandatory = new Proxy({} as Record<string, string>, {
	get(_, name: string) {
		return env.get(name) || fatalError(`Missing env var ${name}`);
	}
});
