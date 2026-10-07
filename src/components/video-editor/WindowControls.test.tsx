import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ value: "linux" }));
vi.mock("@/utils/platformUtils", () => ({ getPlatform: async () => platform.value }));

import { WindowControls } from "./WindowControls";

const t = (key: string) => key;

describe("WindowControls", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		platform.value = "linux";
	});

	it("shows minimize, maximize and close on Linux and sends each action", async () => {
		const windowControl = vi.fn(async (action: string) => ({
			maximized: action === "toggle-maximize",
		}));
		Object.assign(window, { electronAPI: { windowControl } });

		render(<WindowControls t={t} />);
		const close = await screen.findByRole("button", { name: "window.close" });
		fireEvent.click(screen.getByRole("button", { name: "window.minimize" }));
		fireEvent.click(screen.getByRole("button", { name: "window.maximize" }));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "window.restore" })).toBeInTheDocument(),
		);
		fireEvent.click(close);
		await waitFor(() => expect(windowControl).toHaveBeenCalledTimes(3));
		expect(windowControl.mock.calls.map((call) => call[0])).toEqual([
			"minimize",
			"toggle-maximize",
			"close",
		]);
	});

	it("renders nothing on Windows and macOS, which keep native controls", async () => {
		platform.value = "win32";
		Object.assign(window, { electronAPI: { windowControl: vi.fn() } });
		const { container } = render(<WindowControls t={t} />);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(container).toBeEmptyDOMElement();
	});
});
