/**
 * Resolve the PR number for a GitHub Actions run from its event payload.
 * Precedence: a pull_request event, then a refs/pull/<n>/merge ref, then a
 * manual workflow_dispatch `pr_number` input. Returns null for non-PR runs.
 */
export default function parsePrNumber(event: any, githubRef?: string): number | null {
	const fromMergeRef = githubRef?.match(/^refs\/pull\/(\d+)\/merge$/)?.[1];
	return event.pull_request?.number
		?? (fromMergeRef ? Number(fromMergeRef) : null)
		?? (event.inputs?.pr_number ? Number(event.inputs.pr_number) : null);
}
