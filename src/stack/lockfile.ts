import { outDir } from "../constants.ts";
import { prNumber } from "../github/pr.ts";

const environment = String(prNumber ?? "default");

export default `${outDir}/${environment}.json`;

/** Earlier lockfiles of this environment, one per build that changed a digest. */
export const historyDir = `${outDir}/history/${environment}`;

/** How many earlier lockfiles `rig build` keeps per environment. */
export const historyLength = 20;
