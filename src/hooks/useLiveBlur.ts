import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LiveBlurArea, LiveBlurState } from "@/lib/liveBlur";

export function useLiveBlur(sourceId?: string) {
	const [state, setState] = useState<LiveBlurState>({ areas: [], recording: false, paused: false });
	const current = useRef(state);
	current.current = state;
	useEffect(() => {
		void sourceId;
		let changed = false;
		let active = true;
		const unsubscribe = window.electronAPI.onLiveBlurStateChanged((next) => {
			changed = true;
			current.current = next;
			setState(next);
		});
		window.electronAPI
			.getLiveBlurState()
			.then((next) => {
				if (active && !changed) {
					current.current = next;
					setState(next);
				}
			})
			.catch((error) => console.error("Cannot load live blur:", error));
		return () => {
			active = false;
			unsubscribe();
		};
	}, [sourceId]);
	const update = (areas: LiveBlurArea[]) => {
		void window.electronAPI.setLiveBlurAreas(areas).catch((error) => toast.error(String(error)));
	};
	return {
		state,
		update,
		change: (id: string, changes: Partial<LiveBlurArea>) =>
			update(
				current.current.areas.map((area) => (area.id === id ? { ...area, ...changes } : area)),
			),
		remove: (id: string) => update(current.current.areas.filter((area) => area.id !== id)),
	};
}
