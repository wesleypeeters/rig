const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Converts a git ref to a URL-safe slug.
 * Matches GitLab's CI_COMMIT_REF_SLUG behavior.
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
