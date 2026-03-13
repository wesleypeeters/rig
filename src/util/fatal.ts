export default function (message: string, exitCode = 1) {
	console.error(`%cFatal: ${message}`, "color: red; font-weight: bold");
	Deno.exit(exitCode);
}
