import $ from "@david/dax";
import id from "../stack/id.ts";

await $`docker run -it --rm -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/amir20/dtop:master --filter name=${id}_`;
