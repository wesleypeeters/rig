export default async function <T>(arr: T[], predicate: (value: T, index: number, array: T[]) => Promise<boolean>): Promise<T[]> {
	const results = await Promise.all(arr.map(predicate));
	return arr.filter((_, i) => results[i]);
}
