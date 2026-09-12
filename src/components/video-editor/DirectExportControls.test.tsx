import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectExportControls } from "./DirectExportControls";

const props = () => ({
	format: "mp4" as const,
	quality: "good" as const,
	rate: 20 as const,
	size: "medium" as const,
	loop: true,
	onFormat: vi.fn(),
	onQuality: vi.fn(),
	onRate: vi.fn(),
	onSize: vi.fn(),
	onLoop: vi.fn(),
	onExport: vi.fn(),
	busy: false,
	ready: true,
	exportedPath: null,
	onShowFile: vi.fn(),
	onCopyPath: vi.fn(),
});
afterEach(cleanup);
describe("compact direct export controls", () => {
	it("exposes MP4 quality without editor tools", () => {
		const value = props();
		render(<DirectExportControls {...value} />);
		fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "source" } });
		expect(value.onQuality).toHaveBeenCalledWith("source");
		fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
		expect(value.onExport).toHaveBeenCalledOnce();
		expect(screen.queryByLabelText("Frame rate")).toBeNull();
	});
	it("shows GIF options and locks export until ready", () => {
		const value = props();
		render(<DirectExportControls {...value} format="gif" ready={false} />);
		fireEvent.change(screen.getByLabelText("Frame rate"), { target: { value: "30" } });
		expect(value.onRate).toHaveBeenCalledWith(30);
		expect(
			(screen.getByRole("button", { name: "Export", exact: true }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect(screen.queryByLabelText("Quality")).toBeNull();
	});
});
