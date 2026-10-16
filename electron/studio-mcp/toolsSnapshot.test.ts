import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { STUDIO_MCP_VERSION, STUDIO_TOOLS } from "../../src/lib/studioMcpContract";

// scripts/studio-mcp.mjs answers tools/list from this file, so Claude can list the tools
// without Openscreen being started. Regenerate after changing the contract with:
//   OPENSCREEN_UPDATE_STUDIO_TOOLS=1 npx vitest run electron/studio-mcp/toolsSnapshot.test.ts
//   npx biome format --write scripts/studio-mcp-tools.json
const SNAPSHOT = path.resolve(__dirname, "../../scripts/studio-mcp-tools.json");

it("keeps the launcher's tool list in step with the Studio contract", () => {
	const expected = { version: STUDIO_MCP_VERSION, tools: STUDIO_TOOLS };
	if (process.env.OPENSCREEN_UPDATE_STUDIO_TOOLS === "1")
		writeFileSync(SNAPSHOT, `${JSON.stringify(expected, null, "\t")}\n`);
	expect(JSON.parse(readFileSync(SNAPSHOT, "utf-8"))).toEqual(JSON.parse(JSON.stringify(expected)));
});
