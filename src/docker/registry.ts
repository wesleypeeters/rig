import memoize from "../util/memoize.ts";
import { optional } from "../util/env.ts";

function getImageDetails(imageId: string) {
	const [firstSegment, ...rest] = imageId.split("/");
	return firstSegment.includes(".")
		? [firstSegment, rest.join("/")]
		: ["registry-1.docker.io", (rest.length ? "" : "library/") + imageId];
}

async function fetchToken(url: string, name: string) {
	const response = await fetch(`${url}&scope=repository:${name}:pull`);
	if (!response.ok) throw new Error("Failed to fetch registry token");
	return (await response.json()).token;
}

const accept = [
	"application/vnd.oci.image.index.v1+json",
	"application/vnd.oci.image.manifest.v1+json",
	"application/vnd.docker.distribution.manifest.v2+json",
	"application/vnd.docker.distribution.manifest.list.v2+json",
].join(", ");

export default function (getAuthUrl?: (host: string) => string | undefined) {
	const getAuthUrlMem = memoize(getAuthUrl!);

	const getRegistryApi = memoize(async function (imageId: string) {
		const [host, name] = getImageDetails(imageId);
		const authUrl = (getAuthUrl && getAuthUrlMem(host)) || `https://${host}/token?service=${host}`;
		const token = await fetchToken(authUrl, name);
		return {
			async fetch(path: string) {
				const url = `https://${host}/v2/${name}/${path}`;
				const response = await fetch(url, {
					method: "HEAD",
					headers: {
						accept,
						...(token && { authorization: `Bearer ${token}` }),
					}
				});
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
				return `${host}/${name}@${response.headers.get("Docker-Content-Digest")!}`;
			}
		};
	});

	const fetchImageSpecifier = memoize(async (imageId: string, tag: string) =>
		(await getRegistryApi(imageId)).fetch(`manifests/${tag}`)
	);

	return {
		resolveCanonicalImageSpecifier(imageSpecifier: string) {
			const [image, digest] = imageSpecifier.split("@", 2);
			if (digest) throw new Error("Image specifier already contains digest");
			const [imageId, tag = "latest"] = image.split(":", 2);
			if (!imageId) throw new Error("Missing image id");
			return fetchImageSpecifier(imageId, tag);
		}
	};
}
