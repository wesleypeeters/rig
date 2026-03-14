import $ from "@david/dax";
import slugify from "../util/slugify.ts";
import { optional } from "../util/env.ts";

const { GITHUB_ACTIONS, GITHUB_HEAD_REF, GITHUB_REF_NAME, GITHUB_REF, GITHUB_EVENT_PATH } = optional;

let _defaultBranch: string;
let _currentBranch: string;
let _prNumber: number | null = null;

if (GITHUB_ACTIONS) {
	// PR builds use GITHUB_HEAD_REF, push builds use GITHUB_REF_NAME.
	_currentBranch = GITHUB_HEAD_REF || GITHUB_REF_NAME!;
	// Read the event payload for PR number and default branch.
	const event = JSON.parse(await Deno.readTextFile(GITHUB_EVENT_PATH!));
	_defaultBranch = event.repository?.default_branch ?? "main";
	_prNumber = event.pull_request?.number
		?? (GITHUB_REF?.match(/^refs\/pull\/(\d+)\/merge$/)?.[1] ? Number(RegExp.$1) : null)
		?? (event.inputs?.pr_number ? Number(event.inputs.pr_number) : null);
} else {
	[_defaultBranch, _currentBranch] = await Promise.all([
		$`git symbolic-ref refs/remotes/origin/HEAD`.text().then(ref => ref.replace(/^.*\//, "")),
		$`git rev-parse --abbrev-ref HEAD`.text()
	]);
}

export const defaultBranch = _defaultBranch;
export const currentBranch = _currentBranch;
export const currentBranchSlug = slugify(_currentBranch);
export const prNumber = _prNumber;
export const isReviewEnv = _prNumber !== null;
