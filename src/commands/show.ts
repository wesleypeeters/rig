import $ from "@david/dax";
import id from "../stack/id.ts";

// Pinned by digest: this image gets the Docker socket, which is root on the host.
const dtop = "ghcr.io/amir20/dtop:0.9.3@sha256:9cd009f34ea9874d6fd666c0f9f541df6a610f220292450a6a088d8090b2d067";

await $`docker run -it --rm -v /var/run/docker.sock:/var/run/docker.sock ${dtop} --filter name=${id}_`;
