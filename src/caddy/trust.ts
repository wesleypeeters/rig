import $ from "@david/dax";
import info from "../util/info.ts";
import { rigDir } from "../constants.ts";

info("Saving Caddy's internal root CA certificate...");
const certFile = "root.crt";
const outPath = `${rigDir}/out`;
await Deno.mkdir(outPath, { recursive: true });
const certFilePath = `${outPath}/${certFile}`;

// Extract cert from caddy container.
const containerId = (await $`docker ps --filter name=caddy_caddy --format "{{.ID}}"`.text()).trim().split("\n")[0];
const cert = await $`docker exec ${containerId} cat /data/caddy/pki/authorities/local/${certFile}`.bytes();
await Deno.writeFile(certFilePath, cert);

info("Installing root CA certificate...");
const os = Deno.build.os;
if (os === "darwin") {
	await $`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certFilePath}`;
} else if (os === "linux") {
	await $`sudo cp ${certFilePath} /usr/local/share/ca-certificates/caddy-root.crt`;
	await $`sudo update-ca-certificates`;
} else {
	console.info(`Unsupported OS. Manually install ${certFilePath} as a trusted root CA.`);
}
info("Certificate installed. Verify at https://localhost/");
