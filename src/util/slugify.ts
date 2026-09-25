const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Converts a git ref to a slug usable in an image tag or hostname label:
 * lowercase a-z0-9, runs of anything else collapsed to a single "-", no
 * leading or trailing "-", at most 63 characters. Close to GitLab's
 * CI_COMMIT_REF_SLUG, which doesn't collapse runs.
 */
export default function (ref: string): string {
	const slug = ref
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-+/g, "-");
	const bytes = encoder.encode(slug);
	if (bytes.length <= 63) return slug;
	return decoder.decode(bytes.slice(0, 63)).replace(/-+$/, "");
}
