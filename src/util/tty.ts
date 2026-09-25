/** `-it` for an interactive terminal, `-i` when piped or scripted (CI, cron). */
export default function dockerTtyFlags(): string[] {
	return Deno.stdin.isTerminal() && Deno.stdout.isTerminal() ? ["-it"] : ["-i"];
}
