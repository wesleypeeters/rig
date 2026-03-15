import { outDir } from "../constants.ts";
import { prNumber } from "../github/pr.ts";

export default `${outDir}/${prNumber ?? "default"}.json`;
