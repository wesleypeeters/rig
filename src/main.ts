// docker buildx bake loads the .env file by default while docker stack commands don't.
// Since this tool wraps both we always explicitly load the .env file to prevent confusion.
import "@std/dotenv/load";

function findModule() {
	const [a0, a1] = Deno.args;
	if (/^(config|validate|build|deploy|show|debug|exec|rm|cleanup|rollback|update)$/.test(a0)) return a0;
	if (a0 === "caddy") {
		if (/^(init|trust|tld|log)$/.test(a1)) return `caddy/${a1}`;
	}
	return "usage";
}

import(`./commands/${findModule()}.ts`);
