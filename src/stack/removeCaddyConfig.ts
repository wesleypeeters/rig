import caddyApiFetch from "../caddy/api.ts";
import syncPublicSubjects from "../caddy/syncPublicSubjects.ts";

export default async function (caddyStackId: string, portRangeId?: number) {
	await caddyApiFetch("delete", caddyStackId);
	if (portRangeId !== undefined) await caddyApiFetch("delete", `${portRangeId}`);
	await syncPublicSubjects();
}
