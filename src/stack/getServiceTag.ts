import name from "./name.ts";
import { optional } from "../util/env.ts";
import { currentBranchSlug } from "../github/pr.ts";

const registry = optional.GITHUB_REGISTRY || (optional.GITHUB_REPOSITORY ? `ghcr.io/${optional.GITHUB_REPOSITORY.toLowerCase()}` : `${name}.local`);

export default function (service: string): string {
	return `${registry}/${service}:${currentBranchSlug}`;
}
