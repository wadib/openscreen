import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const contractSource = fs.readFileSync(
	path.join(root, "src", "lib", "studioMcpContract.ts"),
	"utf8",
);
const mcpVersion = contractSource.match(/STUDIO_MCP_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!mcpVersion) throw new Error("Cannot read STUDIO_MCP_VERSION");
const version = packageJson.version;
const outputDirectory = path.join(root, "release", version);
fs.mkdirSync(outputDirectory, { recursive: true });
const manifest = {
	schemaVersion: 1,
	appVersion: version,
	components: {
		studioMcp: mcpVersion,
		captureEngine: version,
		blurry: version,
		cameraControls: version,
	},
};
const output = path.join(outputDirectory, "openscreen-components.json");
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Component update manifest: ${output}`);
