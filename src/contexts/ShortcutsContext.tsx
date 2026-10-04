import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { DEFAULT_SHORTCUTS, mergeWithDefaults, type ShortcutsConfig } from "@/lib/shortcuts";
import { isMac as getIsMac } from "@/utils/platformUtils";

interface ShortcutsContextValue {
	shortcuts: ShortcutsConfig;
	ready: boolean;
	isMac: boolean;
	setShortcuts: (config: ShortcutsConfig) => void;
	persistShortcuts: (config?: ShortcutsConfig) => Promise<boolean>;
	isConfigOpen: boolean;
	openConfig: () => void;
	closeConfig: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function useShortcuts(): ShortcutsContextValue {
	const ctx = useContext(ShortcutsContext);
	if (!ctx) throw new Error("useShortcuts must be used within <ShortcutsProvider>");
	return ctx;
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
	const [shortcuts, setShortcuts] = useState<ShortcutsConfig>(DEFAULT_SHORTCUTS);
	const [ready, setReady] = useState(false);
	const [isMac, setIsMac] = useState(false);
	const [isConfigOpen, setIsConfigOpen] = useState(false);

	useEffect(() => {
		let disposed = false;
		let changed = false;
		const unsubscribe = window.electronAPI.onShortcutsChanged?.((saved) => {
			changed = true;
			setReady(true);
			setShortcuts(mergeWithDefaults(saved as Partial<ShortcutsConfig>));
		});
		getIsMac()
			.then((value) => {
				if (!disposed) setIsMac(value);
			})
			.catch(() => {
				// Keep default non-mac fallback if detection fails.
			});

		window.electronAPI
			.getShortcuts?.()
			.then((saved) => {
				if (saved && !disposed && !changed) {
					setShortcuts(mergeWithDefaults(saved as Partial<ShortcutsConfig>));
				}
			})
			.catch(() => {
				// Keep default shortcuts if persisted settings can't be loaded.
			})
			.finally(() => {
				if (!disposed) setReady(true);
			});
		return () => {
			disposed = true;
			unsubscribe?.();
		};
	}, []);

	const persistShortcuts = useCallback(
		async (config?: ShortcutsConfig) => {
			const configToSave = config ?? shortcuts;
			const result = await window.electronAPI.saveShortcuts(configToSave);
			if (!result.success && result.error !== "registration")
				throw new Error(result.error ?? "Unable to save shortcuts");
			return result.success;
		},
		[shortcuts],
	);

	const openConfig = useCallback(() => setIsConfigOpen(true), []);
	const closeConfig = useCallback(() => setIsConfigOpen(false), []);

	const value = useMemo<ShortcutsContextValue>(
		() => ({
			shortcuts,
			ready,
			isMac,
			setShortcuts,
			persistShortcuts,
			isConfigOpen,
			openConfig,
			closeConfig,
		}),
		[shortcuts, ready, isMac, persistShortcuts, isConfigOpen, openConfig, closeConfig],
	);

	return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}
