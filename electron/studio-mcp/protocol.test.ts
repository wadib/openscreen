// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS, validateStudioTool } from "../../src/lib/studioMcpContract";
import { handleStudioRpc } from "./protocol";

describe("Studio MCP protocol", () => {
	it("negotiates MCP and exposes only the Studio tool allowlist", async () => {
		const execute = vi.fn();
		expect(
			await handleStudioRpc(
				{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
				execute,
			),
		).toMatchObject({ result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
		const listed = await handleStudioRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, execute);
		expect(listed).toMatchObject({ result: { tools: STUDIO_TOOLS } });
		expect(STUDIO_TOOLS.every((tool) => tool.name.startsWith("studio_"))).toBe(true);
		expect(STUDIO_TOOLS.some((tool) => /record|execute|shell|delete|upload/.test(tool.name))).toBe(
			false,
		);
		expect(execute).not.toHaveBeenCalled();
	});
	it("ignores initialized notifications and rejects unknown methods", async () => {
		expect(
			await handleStudioRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, vi.fn()),
		).toBeUndefined();
		expect(
			await handleStudioRpc({ jsonrpc: "2.0", id: 5, method: "shell" }, vi.fn()),
		).toMatchObject({ error: { code: -32601 } });
	});
	it("validates arguments before dispatching", async () => {
		const execute = vi.fn();
		expect(
			await handleStudioRpc(
				{
					jsonrpc: "2.0",
					id: 4,
					method: "tools/call",
					params: { name: "studio_preview", arguments: { action: "record" } },
				},
				execute,
			),
		).toMatchObject({ result: { isError: true } });
		expect(execute).not.toHaveBeenCalled();
		expect(() => validateStudioTool("studio_status", { arbitrary: "code" })).toThrow(
			"Unknown argument",
		);
		expect(() =>
			validateStudioTool("studio_set_zoom", {
				revision: 0,
				startMs: 0,
				endMs: 1000,
				focus: { cx: 0.5, cy: 0.5 },
				area: { width: 0, height: 1, fit: "fit" },
			}),
		).toThrow();
		expect(() => validateStudioTool("studio_history", { revision: 1.5, action: "undo" })).toThrow();
	});
	it("returns text results, PNG images, and actionable failures", async () => {
		const rpc = (name: string) => ({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: {} },
		});
		expect(
			await handleStudioRpc(rpc("studio_status"), async () => ({ revision: 3 })),
		).toMatchObject({ result: { content: [{ type: "text", text: '{"revision":3}' }] } });
		expect(await handleStudioRpc(rpc("studio_snapshot"), async () => "png-data")).toMatchObject({
			result: { content: [{ type: "image", mimeType: "image/png", data: "png-data" }] },
		});
		expect(
			await handleStudioRpc(rpc("studio_status"), async () => {
				throw new Error("Studio closed");
			}),
		).toMatchObject({ result: { isError: true, content: [{ text: "Studio closed" }] } });
	});
	it("rejects malformed JSON-RPC requests", async () => {
		for (const request of [
			null,
			[],
			{},
			{ jsonrpc: "1.0", id: 1, method: "ping" },
			{ jsonrpc: "2.0", id: {}, method: "ping" },
		]) {
			expect(await handleStudioRpc(request, vi.fn())).toMatchObject({ error: { code: -32600 } });
		}
	});
});
