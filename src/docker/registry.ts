import memoize from "../util/memoize.ts";

/**
 * Split an image reference into registry host, repository and tag, following
 * Docker's rules: the first path segment is a registry when it contains a dot
 * or a port, or is "localhost"; anything else is a Docker Hub repository.
 */
export function parseImageReference(reference: string) {
	const slash = reference.lastIndexOf("/");
	const colon = reference.lastIndexOf(":");
	const [imageId, tag] = colon > slash ? [reference.slice(0, colon), reference.slice(colon + 1)] : [reference, "latest"];
	const [firstSegment, ...rest] = imageId.split("/");
	const isRegistry = rest.length > 0 && (/[.:]/.test(firstSegment) || firstSegment === "localhost");
	const [host, name] = isRegistry ? [firstSegment, rest.join("/")] : ["docker.io", imageId];
	if (host !== "docker.io") return { host, name, tag };
	return { host: "registry-1.docker.io", name: name.includes("/") ? name : `library/${name}`, tag };
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

	const getRegistryApi = memoize(async function (host: string, name: string) {
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

	const fetchImageSpecifier = memoize(async (host: string, name: string, tag: string) =>
		(await getRegistryApi(host, name)).fetch(`manifests/${tag}`)
	);

	return {
		resolveCanonicalImageSpecifier(imageSpecifier: string) {
			if (imageSpecifier.includes("@")) throw new Error("Image specifier already contains digest");
			if (!imageSpecifier) throw new Error("Missing image id");
			const { host, name, tag } = parseImageReference(imageSpecifier);
			return fetchImageSpecifier(host, name, tag);
		}
	};
}
