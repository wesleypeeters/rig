import caddyApiFetch from "./api.ts";
import { defaultOnDemandInternalSubjects, generateSubjectWildcards } from "./tls.ts";
import info from "../util/info.ts";

const tld = Deno.args[2];

await caddyApiFetch("patch", "@ondemand-internal-subjects/subjects", [
	...defaultOnDemandInternalSubjects,
	...generateSubjectWildcards(tld, 10)
]);
info(`Custom TLD wildcard registered for ${tld}`);
