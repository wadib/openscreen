// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	checkForUpdates,
	compareVersions,
	isUpdateCheckEnabled,
	NO_PUBLISHED_RELEASES,
	UPDATE_MANIFEST_ASSET,
} from "./update-checker";

function response(value: unknown, status = 200) {
	return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(value) };
}

describe("update checker", () => {
	it("compares semantic release versions", () => {
		expect(compareVersions("1.10.27", "1.10.26")).toBeGreaterThan(0);
		expect(compareVersions("1.10.27", "1.10.27")).toBe(0);
		expect(compareVersions("1.9.9", "1.10.0")).toBeLessThan(0);
	});

	it("enables the user-facing checker only from 1.10.28", () => {
		expect(isUpdateCheckEnabled("1.10.27")).toBe(false);
		expect(isUpdateCheckEnabled("1.10.28")).toBe(true);
		expect(isUpdateCheckEnabled("1.11.0")).toBe(true);
	});

	it("reports app updates and falls back when a release has no component manifest", async () => {
		const fetchUpdate = vi.fn().mockResolvedValue(
			response({
				tag_name: "v1.11.0",
				html_url: "https://github.com/wadib/openscreen/releases/tag/v1.11.0",
				assets: [],
			}),
		);
		const result = await checkForUpdates("1.10.27", "linux", fetchUpdate);
		expect(result).toMatchObject({
			latestVersion: "1.11.0",
			updateAvailable: true,
			manifestAvailable: false,
		});
		expect(result.components.map(({ id }) => id)).toEqual([
			"studioMcp",
			"captureEngine",
			"cameraControls",
		]);
		expect(result.components.every(({ updateAvailable }) => updateAvailable === null)).toBe(true);
	});

	it("compares every versioned component in a release manifest", async () => {
		const fetchUpdate = vi
			.fn()
			.mockResolvedValueOnce(
				response({
					tag_name: "1.10.27",
					html_url: "https://github.com/wadib/openscreen/releases/tag/1.10.27",
					assets: [
						{
							name: UPDATE_MANIFEST_ASSET,
							browser_download_url:
								"https://github.com/wadib/openscreen/releases/download/1.10.27/openscreen-components.json",
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				response({
					schemaVersion: 1,
					appVersion: "1.10.27",
					components: {
						studioMcp: "1.1.0",
						captureEngine: "1.10.27",
						blurry: "1.10.28",
						cameraControls: "1.10.27",
					},
				}),
			);
		const result = await checkForUpdates("1.10.27", "win32", fetchUpdate);
		expect(result.manifestAvailable).toBe(true);
		expect(result.components).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "studioMcp", updateAvailable: true }),
				expect.objectContaining({ id: "blurry", updateAvailable: true }),
				expect.objectContaining({ id: "captureEngine", updateAvailable: false }),
			]),
		);
	});

	it("rejects untrusted release links", async () => {
		const fetchUpdate = vi.fn().mockResolvedValue(
			response({
				tag_name: "1.11.0",
				html_url: "https://example.com/download",
				assets: [],
			}),
		);
		await expect(checkForUpdates("1.10.27", "win32", fetchUpdate)).rejects.toThrow("not trusted");
	});
});

it("reports a repository without published releases distinctly", async () => {
	const fetchUpdate = vi.fn().mockResolvedValue(response({ message: "Not Found" }, 404));
	await expect(checkForUpdates("1.10.32", "linux", fetchUpdate)).rejects.toThrow(
		NO_PUBLISHED_RELEASES,
	);
});
