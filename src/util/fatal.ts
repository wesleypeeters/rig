export default function (message: string, exitCode = 1): never {
	console.error(`%cFatal: ${message}`, "color: red; font-weight: bold");
	Deno.exit(exitCode);
}
