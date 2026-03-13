import { crypto } from "@std/crypto";
import { encodeBase58 } from "@std/encoding/base58";

export default async function (filePath: string) {
	using file = await Deno.open(filePath, { read: true });
	return encodeBase58(await crypto.subtle.digest("BLAKE2B-128", file.readable));
}
