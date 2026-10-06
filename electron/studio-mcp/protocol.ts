import {
	STUDIO_TOOLS,
	type StudioArguments,
	validateStudioTool,
} from "../../src/lib/studioMcpContract";

export async function handleStudioRpc(
	request: unknown,
	execute: (name: string, args: StudioArguments) => Promise<unknown>,
) {
	if (!request || typeof request !== "object" || Array.isArray(request))
		return rpcError(null, -32600, "Invalid request");
	const rpc = request as {
		jsonrpc?: string;
		id?: string | number | null;
		method?: string;
		params?: Record<string, unknown>;
	};
	if (
		rpc.jsonrpc !== "2.0" ||
		typeof rpc.method !== "string" ||
		(rpc.id !== undefined &&
			rpc.id !== null &&
			typeof rpc.id !== "number" &&
			typeof rpc.id !== "string")
	)
		return rpcError(null, -32600, "Invalid request");
	if (rpc.id === undefined) return undefined;
	const result = (value: unknown) => ({ jsonrpc: "2.0", id: rpc.id, result: value });
	if (rpc.method === "initialize") {
		const requested = rpc.params?.protocolVersion;
		return result({
			protocolVersion: requested === "2025-03-26" ? requested : "2024-11-05",
			capabilities: { tools: {} },
			serverInfo: { name: "openscreen-studio", version: "1.0.0" },
		});
	}
	if (rpc.method === "ping") return result({});
	if (rpc.method === "tools/list") return result({ tools: STUDIO_TOOLS });
	if (rpc.method !== "tools/call") return rpcError(rpc.id ?? null, -32601, "Method not found");
	try {
		const name = rpc.params?.name;
		if (typeof name !== "string") throw new Error("Tool name is required");
		const args = validateStudioTool(name, rpc.params?.arguments ?? {});
		const value = await execute(name, args);
		if (name === "studio_snapshot")
			return result({ content: [{ type: "image", mimeType: "image/png", data: value }] });
		return result({ content: [{ type: "text", text: JSON.stringify(value) }] });
	} catch (error) {
		return result({
			isError: true,
			content: [
				{ type: "text", text: error instanceof Error ? error.message : "Studio command failed" },
			],
		});
	}
}

export function rpcError(id: string | number | null, code: number, message: string) {
	return { jsonrpc: "2.0", id, error: { code, message } };
}
