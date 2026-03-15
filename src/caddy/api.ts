import caddyFetch from "./fetch.ts";
import fatalError from "../util/fatal.ts";

/**
 * Call the admin API. Only accepts @id subpaths.
 */
export default async function (method: string, objectUrl: string | number, body?: any) {
	const response = await caddyFetch(method, `id/${objectUrl}`, body !== undefined ? JSON.stringify(body) : undefined);
	const data = response.json();
	const error = data?.error;
	if (!error) return data;
	if (!body && error.startsWith("unknown object ID")) return undefined;
	fatalError(error);
}
