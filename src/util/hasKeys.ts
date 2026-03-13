export default function (o: any) {
	for (const _ in o) return true;
	return false;
}
