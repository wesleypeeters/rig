type Fn = (...args: any[]) => any;

function defaultSerializer(args: any[]) {
	return JSON.stringify(args);
}

function trimTrailingEmptyArgs(args: unknown[]) {
	let i = args.length;
	while (i > 0 && args[i - 1] == undefined) i--;
	args.length = i;
}

export default function <T extends Fn>(
	fn: T,
	serializeArgs: (args: Parameters<T>) => any = defaultSerializer,
): T {
	const cache = new Map<any, ReturnType<T>>();
	return ((...args: Parameters<T>): ReturnType<T> => {
		trimTrailingEmptyArgs(args);
		const key = serializeArgs(args);
		if (cache.has(key)) return cache.get(key)!;
		const result = fn(...args);
		cache.set(key, result);
		return result;
	}) as T;
}
