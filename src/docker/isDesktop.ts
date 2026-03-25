import $ from "@david/dax";

const name = (await $`docker info --format '{{.Name}}'`.text());
export default name === "docker-desktop" || name === "orbstack";
