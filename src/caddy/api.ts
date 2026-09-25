import caddyFetch from "./fetch.ts";
import fatalError from "../util/fatal.ts";

/**
 * Call the admin API. Only accepts @id subpaths.
 *
 * Reading or deleting an id that doesn't exist yields undefined; every other
 * failure is fatal.
 */
export default async function (method: string, objectUrl: string | number, body?: any) {
	const response = await caddyFetch(method, `id/${objectUrl}`, body !== undefined ? JSON.stringify(body) : undefined);
	let data: any;
	try {
		data = JSON.parse(response.body || "null");
	} catch {
		data = null;
	}
	const error: string | undefined = data?.error;
	if (response.ok && !error) return data;
	if (body === undefined && error?.startsWith("unknown object ID")) return undefined;
	fatalError(error ?? `Caddy admin API answered ${response.status} to ${method.toUpperCase()} /id/${objectUrl}`);
}
