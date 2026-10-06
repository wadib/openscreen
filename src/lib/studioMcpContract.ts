export type StudioArguments = Record<string, unknown>;
export const STUDIO_MCP_VERSION = "1.0.0";
export interface StudioCommand {
	id: string;
	name: string;
	args: StudioArguments;
}

type Schema = {
	type: "object" | "string" | "number" | "integer" | "boolean";
	properties?: Record<string, Schema>;
	required?: string[];
	additionalProperties?: boolean;
	enum?: (string | number)[];
	minimum?: number;
	maximum?: number;
	maxLength?: number;
};
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
	type: "object",
	properties,
	required,
	additionalProperties: false,
});
const number = (minimum: number, maximum: number): Schema => ({ type: "number", minimum, maximum });
const text: Schema = { type: "string", maxLength: 4096 };
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const revision: Schema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const time = number(0, 86_400_000);
const interval = { revision, startMs: time, endMs: time };

function tool(name: string, description: string, inputSchema: Schema, readOnly = false) {
	return {
		name,
		description,
		inputSchema,
		annotations: {
			readOnlyHint: readOnly,
			destructiveHint: false,
			openWorldHint: false,
		},
	};
}

export const STUDIO_TOOLS = [
	tool(
		"studio_status",
		"Inspect Studio readiness, revision, media, timeline, and export job. Times are milliseconds. Read a fresh revision before editing.",
		object({}),
		true,
	),
	tool(
		"studio_open_project",
		"Open a local .openscreen project inside an allowed folder. Refuses to discard unsaved changes or load remote media.",
		object({ path: text }, ["path"]),
	),
	tool(
		"studio_set_zoom",
		"Add a zoom or replace the zoom with the given id. Coordinates and custom area dimensions are normalized 0..1. Returns the id. Overlapping zooms are rejected.",
		object(
			{
				...interval,
				id: text,
				depth: { type: "integer", minimum: 1, maximum: 6 },
				scale: number(1, 5),
				focus: object({ cx: number(0, 1), cy: number(0, 1) }, ["cx", "cy"]),
				area: object(
					{ width: number(0.05, 1), height: number(0.05, 1), fit: choice("fit", "fill") },
					["width", "height", "fit"],
				),
			},
			["revision", "startMs", "endMs", "focus"],
		),
	),
	tool(
		"studio_add_trim",
		"Exclude an interval from playback/export; this is not a keep-range. Original media is untouched.",
		object(interval, ["revision", "startMs", "endMs"]),
	),
	tool(
		"studio_add_speed",
		"Change playback speed over an interval (0.1..16x). Original media is untouched.",
		object({ ...interval, speed: number(0.1, 16) }, ["revision", "startMs", "endMs", "speed"]),
	),
	tool(
		"studio_remove_region",
		"Remove one timeline region by id without deleting media.",
		object({ revision, kind: choice("zoom", "trim", "speed", "annotation"), id: text }, [
			"revision",
			"kind",
			"id",
		]),
	),
	tool(
		"studio_set_microphone",
		"Adjust the recorded microphone track. Positive offset delays audio; gain is a multiplier. Does not open a live microphone.",
		object(
			{
				revision,
				offsetMs: number(-60_000, 60_000),
				gain: number(0, 4),
				muted: { type: "boolean" },
			},
			["revision"],
		),
	),
	tool(
		"studio_set_layout",
		"Adjust output canvas, frame padding and webcam layout for recorded media. Uses Studio undo history.",
		object(
			{
				revision,
				aspectRatio: choice("native", "16:9", "9:16", "1:1", "4:3", "4:5", "16:10", "10:16"),
				padding: number(0, 100),
				borderRadius: number(0, 100),
				webcamLayoutPreset: choice(
					"picture-in-picture",
					"no-webcam",
					"vertical-stack",
					"dual-frame",
				),
			},
			["revision"],
		),
	),
	tool(
		"studio_history",
		"Undo or redo Studio edits. Microphone settings are not in the existing undo history.",
		object({ revision, action: choice("undo", "redo") }, ["revision", "action"]),
	),
	tool(
		"studio_preview",
		"Play, pause, or seek the recorded Studio preview; never starts screen capture.",
		object({ action: choice("play", "pause", "seek"), timeMs: time }, ["action"]),
	),
	tool(
		"studio_snapshot",
		"Return a PNG screenshot of the Studio window, including the preview and timeline.",
		object({}),
		true,
	),
	tool(
		"studio_save_copy",
		"Save a new .openscreen copy in an allowed folder. Existing files and originals are never overwritten.",
		object({ path: text, revision }, ["path", "revision"]),
	),
	tool(
		"studio_export",
		"Start an MP4 export through Studio's normal rendering/audio pipeline to a new file. Poll studio_status for completion or failure.",
		object({ path: text, revision, quality: choice("medium", "good", "source") }, [
			"path",
			"revision",
		]),
	),
	tool(
		"studio_cancel_export",
		"Cancel the current agent export. Does not stop recordings or close Openscreen.",
		object({}),
	),
	tool(
		"studio_close",
		"Close this agent-only Studio instance when no export is running. Refuses while there are unsaved edits unless discardUnsaved is true. Never affects the normal Openscreen recorder.",
		object({ discardUnsaved: { type: "boolean" } }),
	),
] as const;

// Validate the small JSON Schema subset used above; no coercion or unknown keys.
function validate(value: unknown, schema: Schema, label: string): void {
	if (schema.type === "object") {
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new Error(`${label} must be an object`);
		const record = value as StudioArguments;
		for (const key of schema.required ?? [])
			if (!(key in record)) throw new Error(`${label}.${key} is required`);
		for (const [key, item] of Object.entries(record)) {
			const property = schema.properties?.[key];
			if (!property) throw new Error(`Unknown argument ${label}.${key}`);
			validate(item, property, `${label}.${key}`);
		}
		return;
	}
	if (schema.type === "number" || schema.type === "integer") {
		if (
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			(schema.type === "integer" && !Number.isInteger(value)) ||
			value < (schema.minimum ?? -Infinity) ||
			value > (schema.maximum ?? Infinity)
		) {
			throw new Error(`${label} is outside its numeric range`);
		}
	} else if (typeof value !== schema.type) throw new Error(`${label} must be ${schema.type}`);
	if (typeof value === "string" && (!value.length || value.length > (schema.maxLength ?? 4096)))
		throw new Error(`${label} has invalid length`);
	if (schema.enum && !schema.enum.includes(value as string | number))
		throw new Error(`${label} is not a supported option`);
}

export function validateStudioTool(name: string, args: unknown): StudioArguments {
	const definition = STUDIO_TOOLS.find((item) => item.name === name);
	if (!definition) throw new Error(`Unknown Studio tool: ${name}`);
	validate(args, definition.inputSchema, "arguments");
	return args as StudioArguments;
}
