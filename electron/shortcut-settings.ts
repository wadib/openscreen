import fs from "node:fs/promises";
import {
	DEFAULT_SHORTCUTS,
	findConflict,
	mergeWithDefaults,
	SHORTCUT_ACTIONS,
	type ShortcutsConfig,
} from "../src/lib/shortcuts";
import { registerOpenAppShortcut } from "./globalShortcut";

function normalizeConfig(value: unknown): ShortcutsConfig | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	for (const action of SHORTCUT_ACTIONS) {
		const binding = input[action];
		if (binding === undefined) continue;
		if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
		const candidate = binding as Record<string, unknown>;
		if (
			typeof candidate.key !== "string" ||
			(!candidate.key.trim() && candidate.key !== " ") ||
			candidate.key.length > 32 ||
			["control", "shift", "alt", "meta"].includes(candidate.key.toLowerCase())
		)
			return null;
		if (
			["ctrl", "shift", "alt"].some(
				(key) => candidate[key] !== undefined && typeof candidate[key] !== "boolean",
			)
		)
			return null;
	}
	const config = mergeWithDefaults(input as Partial<ShortcutsConfig>);
	if (SHORTCUT_ACTIONS.some((action) => findConflict(config[action], action, config))) return null;
	return config;
}

export function createShortcutsSaver(
	file: string,
	onTrigger: () => void,
	onSaved: (config: ShortcutsConfig) => void,
) {
	let queue = Promise.resolve();
	const save = async (value: unknown) => {
		const config = normalizeConfig(value);
		if (!config) return { success: false, error: "invalid" };
		let previous = DEFAULT_SHORTCUTS;
		try {
			previous = normalizeConfig(JSON.parse(await fs.readFile(file, "utf-8"))) ?? previous;
		} catch {
			/* A first save has no previous file. */
		}
		if (!registerOpenAppShortcut(config.openApp, onTrigger))
			return { success: false, error: "registration" };
		try {
			await fs.writeFile(`${file}.tmp`, JSON.stringify(config, null, 2), "utf-8");
			await fs.rename(`${file}.tmp`, file);
		} catch {
			registerOpenAppShortcut(previous.openApp, onTrigger);
			await fs.rm(`${file}.tmp`, { force: true }).catch(() => undefined);
			return { success: false, error: "save" };
		}
		onSaved(config);
		return { success: true };
	};
	return (value: unknown) => {
		const result = queue.then(() => save(value));
		queue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};
}
