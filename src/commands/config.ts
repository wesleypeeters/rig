import config from "../stack/config.ts";
import ymlFiles from "../stack/ymlFiles.ts";

console.log(await config(ymlFiles));
