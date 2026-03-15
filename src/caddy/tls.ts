export function generateSubjectWildcards(domain: string, levels: number) {
	const patterns: string[] = [];
	for (let i = 0; i < levels; i++) patterns.push(domain = `*.${domain}`);
	return patterns;
}

export const defaultOnDemandInternalSubjects = [
	...generateSubjectWildcards("localhost", 10)
];
