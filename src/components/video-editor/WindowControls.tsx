import { Copy, Minus, Square, X } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { getPlatform } from "@/utils/platformUtils";

type Translate = (key: string) => string;

/**
 * Minimize / maximize / close buttons for Linux. Tiling compositors such as Hyprland
 * (Omarchy) draw no title bar, which left the editor window with no visible way to close it.
 * Windows and macOS keep their native controls, so this renders nothing there.
 */
export function WindowControls({ t }: { t: Translate }) {
	const [isLinux, setIsLinux] = useState(false);
	const [maximized, setMaximized] = useState(false);

	useEffect(() => {
		let active = true;
		void getPlatform().then((platform) => {
			if (active) setIsLinux(platform === "linux");
		});
		return () => {
			active = false;
		};
	}, []);

	if (!isLinux || !window.electronAPI?.windowControl) return null;

	const run = async (action: "minimize" | "toggle-maximize" | "close") => {
		const result = await window.electronAPI.windowControl?.(action);
		if (typeof result?.maximized === "boolean") setMaximized(result.maximized);
	};

	const button =
		"flex h-7 w-8 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white";
	return (
		<div
			className="ml-2 flex items-center gap-0.5"
			style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
		>
			<button
				type="button"
				className={button}
				onClick={() => void run("minimize")}
				title={t("window.minimize")}
				aria-label={t("window.minimize")}
			>
				<Minus size={14} />
			</button>
			<button
				type="button"
				className={button}
				onClick={() => void run("toggle-maximize")}
				title={maximized ? t("window.restore") : t("window.maximize")}
				aria-label={maximized ? t("window.restore") : t("window.maximize")}
			>
				{maximized ? <Copy size={12} /> : <Square size={12} />}
			</button>
			<button
				type="button"
				className={`${button} hover:bg-red-500/80`}
				onClick={() => void run("close")}
				title={t("window.close")}
				aria-label={t("window.close")}
			>
				<X size={15} />
			</button>
		</div>
	);
}
