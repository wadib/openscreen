import fs from "node:fs/promises";
import { globalShortcut } from "electron";
import {
	DEFAULT_SHORTCUTS,
	mergeWithDefaults,
	type ShortcutBinding,
	type ShortcutsConfig,
} from "../src/lib/shortcuts";
import { SHORTCUTS_FILE } from "./ipc/handlers";

export const GLOBAL_SHORTCUT_ACTIONS = ["openApp", "toggleRecording", "togglePaused"] as const;
export type GlobalShortcutAction = (typeof GLOBAL_SHORTCUT_ACTIONS)[number];
export type GlobalShortcutCallbacks = Record<GlobalShortcutAction, () => void>;

const KEY_TO_ACCELERATOR: Record<string, string> = {
	" ": "Space",
	"+": "Plus",
	"-": "numsub",
	"*": "nummult",
	"/": "numdiv",
	arrowup: "Up",
	arrowdown: "Down",
	arrowleft: "Left",
	arrowright: "Right",
	escape: "Escape",
	enter: "Return",
	backspace: "Backspace",
	delete: "Delete",
	tab: "Tab",
};

function bindingToAccelerator(binding: ShortcutBinding): string {
	const parts: string[] = [];
	if (binding.ctrl) parts.push("CommandOrControl");
	if (binding.shift) parts.push("Shift");
	if (binding.alt) parts.push("Alt");
	const keyLower = binding.key.toLowerCase();
	parts.push(KEY_TO_ACCELERATOR[keyLower] ?? binding.key.toUpperCase());
	return parts.join("+");
}

type Registration = {
	config: ShortcutsConfig;
	callbacks: GlobalShortcutCallbacks;
	accelerators: string[];
};

let currentRegistration: Registration | null = null;

function installGlobalShortcuts(
	config: ShortcutsConfig,
	callbacks: GlobalShortcutCallbacks,
): Registration | null {
	const accelerators: string[] = [];
	for (const action of GLOBAL_SHORTCUT_ACTIONS) {
		const accelerator = bindingToAccelerator(config[action]);
		if (!globalShortcut.register(accelerator, callbacks[action])) {
			for (const registered of accelerators) globalShortcut.unregister(registered);
			console.warn(`Failed to register global shortcut: ${accelerator}`);
			return null;
		}
		accelerators.push(accelerator);
		console.log(`Global shortcut registered: ${accelerator}`);
	}
	return { config, callbacks, accelerators };
}

export function registerGlobalShortcuts(
	config: ShortcutsConfig,
	callbacks: GlobalShortcutCallbacks,
): boolean {
	const previous = currentRegistration;
	for (const accelerator of previous?.accelerators ?? []) globalShortcut.unregister(accelerator);
	currentRegistration = null;

	const next = installGlobalShortcuts(config, callbacks);
	if (next) {
		currentRegistration = next;
		return true;
	}

	if (previous) currentRegistration = installGlobalShortcuts(previous.config, previous.callbacks);
	return false;
}

export async function loadAndRegisterGlobalShortcuts(
	callbacks: GlobalShortcutCallbacks,
): Promise<void> {
	let config = DEFAULT_SHORTCUTS;
	try {
		config = mergeWithDefaults(JSON.parse(await fs.readFile(SHORTCUTS_FILE, "utf-8")));
	} catch {
		// A first launch has no saved shortcuts.
	}
	registerGlobalShortcuts(config, callbacks);
}

export function unregisterAllGlobalShortcuts(): void {
	globalShortcut.unregisterAll();
	currentRegistration = null;
}
