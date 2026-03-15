import name from "./name.ts";
import { prNumber } from "../github/pr.ts";

export default prNumber ? `${name}_r${prNumber}` : name;
