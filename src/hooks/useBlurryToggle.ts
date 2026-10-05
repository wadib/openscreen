import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadRecordingPreferences, saveRecordingPreferences } from "@/lib/recordingPreferences";

export function useBlurryToggle(enabled: boolean) {
	const [initialSelection] = useState(() => loadRecordingPreferences().blurryEnabled);
	const [selected, setSelected] = useState(initialSelection);
	const [busy, setBusy] = useState(false);
	const current = useRef(initialSelection);
	const pending = useRef(false);
	const sequence = useRef(0);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		if (!enabled)
			return () => {
				mounted.current = false;
			};
		let initialized = false;
		const refresh = async () => {
			if (pending.current) return;
			const request = ++sequence.current;
			try {
				const next = await window.electronAPI.getBlurrySelected();
				if (!mounted.current || request !== sequence.current) return;
				let restored = next;
				if (!initialized && current.current && !next) {
					initialized = true;
					restored = await window.electronAPI.setBlurrySelected(true);
				} else {
					initialized = true;
				}
				if (!mounted.current || request !== sequence.current) return;
				if (current.current && !restored) saveRecordingPreferences({ blurryEnabled: false });
				current.current = restored;
				setSelected(restored);
			} catch (error) {
				console.error("Cannot read Blurry toggle state:", error);
			}
		};
		void refresh();
		const timer = window.setInterval(() => void refresh(), 1000);
		return () => {
			mounted.current = false;
			sequence.current++;
			window.clearInterval(timer);
		};
	}, [enabled]);
	const toggle = async () => {
		if (!enabled || pending.current) return;
		pending.current = true;
		sequence.current++;
		setBusy(true);
		try {
			const next = await window.electronAPI.setBlurrySelected(!current.current);
			if (!mounted.current) return;
			current.current = next;
			setSelected(next);
			saveRecordingPreferences({ blurryEnabled: next });
		} catch (error) {
			toast.error(String(error));
		} finally {
			pending.current = false;
			if (mounted.current) setBusy(false);
		}
	};
	return { selected, busy, toggle };
}
