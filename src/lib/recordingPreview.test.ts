import { expect, it } from "vitest";
import { computeCompositeLayout } from "./compositeLayout";
import { computeRecordingPreviewLayout } from "./recordingPreview";

it.each([
	{ width: 1920, height: 1080 },
	{ width: 280, height: 520 },
	{ width: 1080, height: 1920 },
	{ width: 1000, height: 1000 },
])("keeps webcam inside the captured $width x $height frame after resize", (screenSize) => {
	const webcamSize = { width: 1280, height: 720 };
	const layout = computeRecordingPreviewLayout(
		{ width: 280, height: 180 },
		screenSize,
		webcamSize,
	)!;
	const original = computeCompositeLayout({ canvasSize: screenSize, screenSize, webcamSize })!;
	const { screenRect: screen, webcamRect: webcam } = layout;
	expect(webcam).not.toBeNull();
	expect(webcam!.x).toBeGreaterThanOrEqual(screen.x);
	expect(webcam!.y).toBeGreaterThanOrEqual(screen.y);
	expect(webcam!.x + webcam!.width).toBeLessThanOrEqual(screen.x + screen.width);
	expect(webcam!.y + webcam!.height).toBeLessThanOrEqual(screen.y + screen.height);
	expect(webcam!.width / screen.width).toBeCloseTo(original.webcamRect!.width / screenSize.width);
});
it("does not render a layout before video metadata is ready", () => {
	expect(
		computeRecordingPreviewLayout(
			{ width: 280, height: 180 },
			{ width: 0, height: 0 },
			{ width: 0, height: 0 },
		),
	).toBeNull();
});
