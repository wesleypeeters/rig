/**
 * Build the Host-header strip regex for a cluster TLD, so Caddy route matchers
 * see clean hostnames (app.localhost -> app). The leading dot is part of the
 * input. Any TLD ending in "host" uses a loose \w*host matcher -- note this
 * also captures .localhost, which still strips correctly. Everything else
 * strips the literal, dot-escaped suffix.
 *   .test            -> (.+)\.test$
 *   .dev.example.com -> (.+)\.dev\.example\.com$
 *   .devhost         -> (.+)\.\w*host$   (and so does .localhost)
 */
export default function buildStripRegex(clusterTld: string): string {
	const escapedTld = clusterTld.slice(1).replace(/\./g, "\\.");
	return clusterTld.endsWith("host")
		? "(.+)\\.\\w*host$"
		: `(.+)\\.${escapedTld}$`;
}
