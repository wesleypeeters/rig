import $ from "@david/dax";
import hasKeys from "../util/hasKeys.ts";
import { outDir } from "../constants.ts";
import info from "../util/info.ts";
import gitIgnore from "../util/gitIgnore.ts";
import lockFilePath from "../stack/lockfile.ts";
import interleave from "../util/interleave.ts";
import stack from "../stack/parsed.ts";
import ymlFiles from "../stack/ymlFiles.ts";
import createRegistryClient from "../docker/registry.ts";
import { optional, mandatory } from "../util/env.ts";
import getServiceTag from "../stack/getServiceTag.ts";

const { services } = stack;
gitIgnore(outDir);

const fileList = interleave(ymlFiles, "-f");
const [{ target }] = await Promise.all([
	$`docker buildx bake --progress quiet --print ${fileList}`.json(),
	Deno.mkdir(outDir, { recursive: true })
]) as [{ target: Record<string, unknown> }];

let metadata: Record<string, {
	"containerimage.digest": string;
	"image.name": string;
}> = {};

if (hasKeys(target)) {
	const metadataTempFile = `${outDir}/tmp${Date.now()}.json`;
	info("Building service container images...");
	const tags = Object.keys(target).map(service => `${service}.tags=${getServiceTag(service)}`);
	await $`docker buildx bake ${interleave(tags, "--set")} ${$.rawArg(optional.PUSH == "true" ? "--push" : "")} --provenance false --metadata-file ${metadataTempFile} ${fileList}`;
	metadata = JSON.parse(await Deno.readTextFile(metadataTempFile));
	Deno.remove(metadataTempFile);
} else {
	info("Nothing to build.");
}

const serviceDigests: Record<string, string> = {};
const registryClient = createRegistryClient((host: string) => {
	switch (host) {
		case "registry-1.docker.io":
			return "https://auth.docker.io/token?service=registry.docker.io";
		case "ghcr.io": {
			const { GITHUB_TOKEN } = mandatory;
			return `https://${GITHUB_TOKEN}:@ghcr.io/token?service=ghcr.io`;
		}
	}
});

for (const serviceName in services) {
	const buildMeta = metadata?.[serviceName];
	const { image } = services[serviceName];
	serviceDigests[serviceName] = buildMeta
		? `${buildMeta["image.name"]}@${buildMeta["containerimage.digest"]}`
		: image.includes("@") ? image : await registryClient.resolveCanonicalImageSpecifier(image);
}

info(`Writing image digests to ${lockFilePath}...`);
await Deno.writeTextFile(lockFilePath, JSON.stringify(serviceDigests, null, 2));
info("Done.");
