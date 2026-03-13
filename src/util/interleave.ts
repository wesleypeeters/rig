export default function <T>(arr: T[], sep: T): T[] {
	const result: T[] = [];
	for (const item of arr) result.push(sep, item);
	return result;
}
