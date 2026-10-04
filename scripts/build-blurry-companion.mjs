import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.OPENSCREEN_BLURRY_SOURCE || path.resolve(root, "..", "Blurry");
const output = path.join(root, "electron", "native", "blurry", "win32-x64");
const project = path.join(source, "Blurry", "Blurry.csproj");
if (!fs.existsSync(project))
	throw new Error("Set OPENSCREEN_BLURRY_SOURCE to the original Blurry repository.");
if (
	!fs.readFileSync(path.join(source, "Blurry", "App.xaml.cs"), "utf8").includes("Blurry.Settings.")
)
	throw new Error("Original Blurry requires the settings-only reopen bridge.");
execFileSync(
	"dotnet",
	["publish", project, "-c", "Release", "-r", "win-x64", "--self-contained", "true", "-o", output],
	{
		stdio: "inherit",
		windowsHide: true,
		env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
	},
);
const bundledSource = path.join(output, "source");
fs.mkdirSync(bundledSource, { recursive: true });
fs.cpSync(path.join(source, "Blurry"), path.join(bundledSource, "Blurry"), {
	recursive: true,
	filter: (file) =>
		!path
			.relative(path.join(source, "Blurry"), file)
			.split(path.sep)
			.some((part) => ["bin", "obj"].includes(part)),
});
for (const name of ["Blurry.sln", "LICENSE", "README.md"]) {
	fs.copyFileSync(path.join(source, name), path.join(bundledSource, name));
}
fs.copyFileSync(path.join(source, "LICENSE"), path.join(output, "LICENSE"));
console.log(
	"Original Blurry settings, runtime, license and corresponding source prepared:",
	output,
);
