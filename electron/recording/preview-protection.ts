interface PreviewWindow {
	isDestroyed(): boolean;
	isContentProtected(): boolean;
	setContentProtection(enabled: boolean): void;
}

export async function protectRecordingPreview(win: PreviewWindow): Promise<void> {
	// Windows may not apply affinity until its first-show initialization completes.
	const deadline = Date.now() + 2_000;
	while (!win.isDestroyed()) {
		win.setContentProtection(true);
		if (win.isContentProtected()) return;
		if (Date.now() >= deadline) break;
		await new Promise<void>((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("Recording preview capture exclusion failed");
}
