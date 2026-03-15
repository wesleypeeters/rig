import { stackTarget } from "../constants.ts";
import { exists } from "@std/fs/exists";
import filterAsync from "../util/filterAsync.ts";

export default await filterAsync([
	"stack.yml",
	"stack.override.yml",
	`${stackTarget}.stack.yml`,
	`${stackTarget}.stack.override.yml`
], (f) => exists(f));
