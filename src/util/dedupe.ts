export default function <T>(arr: T[]): T[] {
	return [...new Set(arr)];
}
