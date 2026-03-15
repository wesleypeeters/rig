import { awaitMode } from "../constants.ts";
import $ from "@david/dax";

export default function (name: string) {
	return $`docker stack rm -d=${!awaitMode} ${name}`;
}
