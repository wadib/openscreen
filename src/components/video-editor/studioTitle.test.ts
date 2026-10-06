import { describe, expect, it } from "vitest";
import { studioWindowTitle } from "./studioTitle";

describe("studioWindowTitle", () => {
	it("names the open project without its folder or extension", () => {
		expect(studioWindowTitle("C:\\rec\\recording-1_p6_done.openscreen", false, null)).toBe(
			"Openscreen Studio — recording-1_p6_done",
		);
		expect(studioWindowTitle("/home/sam/osx/media/p7.openscreen", false, null)).toBe(
			"Openscreen Studio — p7",
		);
	});

	it("shows whole-number export progress, clamped to 0..100", () => {
		expect(studioWindowTitle("/x/p2.openscreen", true, 41.9)).toBe(
			"Openscreen Studio — p2 · exporting 41%",
		);
		expect(studioWindowTitle("/x/p2.openscreen", true, 130)).toBe(
			"Openscreen Studio — p2 · exporting 100%",
		);
		expect(studioWindowTitle("/x/p2.openscreen", true, undefined)).toBe(
			"Openscreen Studio — p2 · exporting",
		);
	});

	it("says when no project is open", () => {
		expect(studioWindowTitle(null, false, null)).toBe("Openscreen Studio — no project");
	});
});
