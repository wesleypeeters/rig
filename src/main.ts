function findModule() {
	const [a0, a1] = Deno.args;
	if (/^(config|validate|build|deploy|show|debug|exec|rm|cleanup|rollback)$/.test(a0)) return a0;
	if (a0 === "caddy") {
		if (/^(init|trust|tld|log)$/.test(a1)) return `caddy/${a1}`;
	}
	return "usage";
}

import(`./commands/${findModule()}.ts`);
