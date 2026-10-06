import { expect, it } from "vitest";
import { FrameRenderer } from "./frameRenderer";

for (const shape of [
	{ width: 0.6, height: 0.2, fit: "fit" as const, topIsBackground: true, leftIsBackground: false },
	{ width: 0.2, height: 0.6, fit: "fit" as const, topIsBackground: false, leftIsBackground: true },
	{
		width: 0.6,
		height: 0.2,
		fit: "fill" as const,
		topIsBackground: false,
		leftIsBackground: false,
	},
]) {
	it(`exports ${shape.width} by ${shape.height} (${shape.fit}) without stretching`, async () => {
		const source = document.createElement("canvas");
		source.width = 640;
		source.height = 360;
		const context = source.getContext("2d")!;
		context.fillStyle = "#20a060";
		context.fillRect(0, 0, 640, 360);
		context.fillStyle = "#ff0000";
		context.beginPath();
		context.arc(320, 180, 12, 0, Math.PI * 2);
		context.fill();
		const frame = new VideoFrame(source, { timestamp: 1_000_000 });
		const renderer = new FrameRenderer({
			width: 640,
			height: 360,
			videoWidth: 640,
			videoHeight: 360,
			wallpaper: "#102030",
			zoomRegions: [
				{
					id: "zoom-1",
					startMs: 0,
					endMs: 3000,
					depth: 3,
					focus: { cx: 0.5, cy: 0.5 },
					area: { width: shape.width, height: shape.height, fit: shape.fit },
				},
			],
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			padding: 0,
			borderRadius: 0,
			showShadow: false,
			shadowIntensity: 0,
			showBlur: false,
			platform: "win32",
		});
		try {
			await renderer.initialize();
			await renderer.renderFrame(frame, 1_000_000);
			const output = renderer.getCanvas().getContext("2d")!;
			const pixels = output.getImageData(0, 0, 640, 360).data;
			const pixel = (x: number, y: number) => [
				...pixels.slice((y * 640 + x) * 4, (y * 640 + x) * 4 + 3),
			];
			if (shape.topIsBackground) expect(pixel(320, 20)).toEqual([16, 32, 48]);
			else expect(pixel(320, 20)[1]).toBeGreaterThan(100);
			if (shape.leftIsBackground) expect(pixel(20, 180)).toEqual([16, 32, 48]);
			else expect(pixel(20, 180)[1]).toBeGreaterThan(100);
			const red: { x: number; y: number }[] = [];
			for (let y = 0; y < 360; y++)
				for (let x = 0; x < 640; x++) {
					const index = (y * 640 + x) * 4;
					if (pixels[index] > 200 && pixels[index + 1] < 50) red.push({ x, y });
				}
			expect(red.length).toBeGreaterThan(100);
			const redWidth = Math.max(...red.map((p) => p.x)) - Math.min(...red.map((p) => p.x));
			const redHeight = Math.max(...red.map((p) => p.y)) - Math.min(...red.map((p) => p.y));
			expect(Math.abs(redWidth - redHeight)).toBeLessThanOrEqual(2);
		} finally {
			renderer.destroy();
			frame.close();
		}
	});
}
