import caddyApiFetch from "./api.ts";
import { withTldWildcards } from "./tls.ts";
import fatalError from "../util/fatal.ts";
import info from "../util/info.ts";

const tld = Deno.args[2]?.replace(/^\./, "");
if (!tld || !/^[a-z\d-]+(\.[a-z\d-]+)*$/i.test(tld)) fatalError("Usage: rig caddy tld <name>, e.g. rig caddy tld devhost");

const policy = await caddyApiFetch("get", "@ondemand-internal-subjects");
if (!policy) fatalError("No @ondemand-internal-subjects policy found. Run rig caddy init first.");
await caddyApiFetch("patch", "@ondemand-internal-subjects/subjects", withTldWildcards(policy.subjects, tld));
info(`Custom TLD wildcard registered for .${tld}`);
