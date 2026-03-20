import fatalError from "../util/fatal.ts";
import parsed from "./parsed.ts";

const { name } = parsed["x-rig"] || {};
if (typeof name !== "string") fatalError("No stack name specified");
if (/_r\d+$/.test(name)) fatalError("Stack name conflicts with review environment naming pattern");
export default name;
