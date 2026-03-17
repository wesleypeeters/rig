import { optional } from "../util/env.ts";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_ACTIONS } = optional;
const headers = GITHUB_TOKEN ? {
	"authorization": `Bearer ${GITHUB_TOKEN}`,
	"accept": "application/vnd.github+json",
	"content-type": "application/json"
} : {};
const apiBase = GITHUB_REPOSITORY ? `https://api.github.com/repos/${GITHUB_REPOSITORY}` : "";

async function api(path: string, body?: any) {
	if (!GITHUB_ACTIONS) return null;
	const response = await fetch(`${apiBase}${path}`, {
		method: body ? "POST" : "GET",
		headers,
		body: body ? JSON.stringify(body) : undefined
	});
	return response.ok ? response.json() : null;
}

export async function createDeployment(environment: string, ref: string, url: string): Promise<number | null> {
	const result = await api("/deployments", {
		ref,
		environment,
		auto_merge: false,
		required_contexts: [],
		payload: { url }
	});
	return result?.id ?? null;
}

export async function updateDeploymentStatus(deploymentId: number, state: "pending" | "success" | "failure" | "inactive") {
	await api(`/deployments/${deploymentId}/statuses`, { state });
}

export async function deactivateEnvironment(environment: string) {
	const deployments = await api(`/deployments?environment=${encodeURIComponent(environment)}`);
	if (!Array.isArray(deployments)) return;
	for (const d of deployments) {
		await api(`/deployments/${d.id}/statuses`, { state: "inactive" });
	}
}
