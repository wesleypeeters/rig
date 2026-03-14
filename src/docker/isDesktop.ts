import $ from "@david/dax";

export default (await $`docker info --format '{{.Name}}'`.text()) === "docker-desktop";
