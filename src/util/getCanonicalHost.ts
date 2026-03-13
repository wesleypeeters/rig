/**
 * URL.host omits default ports. This always returns hostname:port.
 */
export default function ({ hostname, port, protocol }: URL) {
	return `${hostname}:${port || (protocol === "https:" ? 443 : 80)}`;
}
