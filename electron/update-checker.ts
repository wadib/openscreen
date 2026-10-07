import { STUDIO_MCP_VERSION } from "../src/lib/studioMcpContract";

export const UPDATE_MANIFEST_ASSET = "openscreen-components.json";
export const LATEST_RELEASE_API = "https://api.github.com/repos/wadib/openscreen/releases/latest";
export const UPDATE_CHECK_MIN_APP_VERSION = "1.10.28";
/** Thrown when the repository has no published release (GitHub answers 404). */
export const NO_PUBLISHED_RELEASES = "NO_PUBLISHED_RELEASES";

export type UpdateComponentId = "studioMcp" | "captureEngine" | "blurry" | "cameraControls";

export interface UpdateComponentStatus {
	id: UpdateComponentId;
	currentVersion: string;
	latestVersion?: string;
	updateAvailable: boolean | null;
}

export interface UpdateCheckResult {
	checkedAt: string;
	currentVersion: string;
	latestVersion: string;
	updateAvailable: boolean;
	releaseUrl: string;
	manifestAvailable: boolean;
	components: UpdateComponentStatus[];
}

export type UpdateFetch = (
	input: string,
	init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}>;

interface GitHubRelease {
	tag_name?: unknown;
	html_url?: unknown;
	assets?: unknown;
}

interface ComponentManifest {
	schemaVersion?: unknown;
	appVersion?: unknown;
	components?: unknown;
}

export async function checkForUpdates(
	currentVersion: string,
	platform: NodeJS.Platform,
	fetchUpdate: UpdateFetch,
): Promise<UpdateCheckResult> {
	const releaseResponse = await fetchUpdate(LATEST_RELEASE_API, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": `Openscreen/${currentVersion}`,
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (releaseResponse.status === 404) {
		throw new Error(NO_PUBLISHED_RELEASES);
	}
	if (!releaseResponse.ok) {
		throw new Error(`Update service returned HTTP ${releaseResponse.status}`);
	}

	const release = (await releaseResponse.json()) as GitHubRelease;
	const latestVersion = normalizeVersion(release.tag_name);
	const releaseUrl = normalizeReleaseUrl(release.html_url);
	const manifestUrl = findManifestUrl(release.assets);
	const manifest = manifestUrl
		? await readManifest(manifestUrl, currentVersion, latestVersion, fetchUpdate)
		: null;
	const latestComponents = manifest?.components ?? {};

	return {
		checkedAt: new Date().toISOString(),
		currentVersion,
		latestVersion,
		updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
		releaseUrl,
		manifestAvailable: manifest !== null,
		components: getLocalComponents(currentVersion, platform).map((component) => {
			const latest = latestComponents[component.id];
			return {
				...component,
				...(latest ? { latestVersion: latest } : {}),
				updateAvailable: latest ? compareVersions(latest, component.currentVersion) > 0 : null,
			};
		}),
	};
}

export function compareVersions(left: string, right: string) {
	const leftParts = parseVersion(left);
	const rightParts = parseVersion(right);
	for (let index = 0; index < leftParts.length; index += 1) {
		if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
	}
	return 0;
}

export function isUpdateCheckEnabled(version: string | undefined) {
	return Boolean(version && compareVersions(version, UPDATE_CHECK_MIN_APP_VERSION) >= 0);
}

function getLocalComponents(currentVersion: string, platform: NodeJS.Platform) {
	return [
		{ id: "studioMcp" as const, currentVersion: STUDIO_MCP_VERSION },
		{ id: "captureEngine" as const, currentVersion },
		...(platform === "win32" ? [{ id: "blurry" as const, currentVersion }] : []),
		{ id: "cameraControls" as const, currentVersion },
	];
}

async function readManifest(
	manifestUrl: string,
	currentVersion: string,
	latestVersion: string,
	fetchUpdate: UpdateFetch,
) {
	const response = await fetchUpdate(manifestUrl, {
		headers: {
			Accept: "application/json",
			"User-Agent": `Openscreen/${currentVersion}`,
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) return null;
	const raw = (await response.json()) as ComponentManifest;
	if (
		raw.schemaVersion !== 1 ||
		normalizeVersion(raw.appVersion) !== latestVersion ||
		typeof raw.components !== "object" ||
		!raw.components
	) {
		throw new Error("The component manifest does not match the latest release");
	}
	const components: Partial<Record<UpdateComponentId, string>> = {};
	for (const id of ["studioMcp", "captureEngine", "blurry", "cameraControls"] as const) {
		const version = (raw.components as Record<string, unknown>)[id];
		if (typeof version === "string") components[id] = normalizeVersion(version);
	}
	return { components };
}

function findManifestUrl(assets: unknown) {
	if (!Array.isArray(assets)) return null;
	for (const asset of assets) {
		if (!asset || typeof asset !== "object") continue;
		const candidate = asset as { name?: unknown; browser_download_url?: unknown };
		if (
			candidate.name !== UPDATE_MANIFEST_ASSET ||
			typeof candidate.browser_download_url !== "string"
		) {
			continue;
		}
		const url = new URL(candidate.browser_download_url);
		if (url.protocol === "https:" && url.hostname === "github.com") return url.toString();
	}
	return null;
}

function normalizeVersion(value: unknown) {
	if (typeof value !== "string") throw new Error("The latest release has no valid version");
	const normalized = value.trim().replace(/^v/i, "");
	parseVersion(normalized);
	return normalized;
}

function parseVersion(value: string) {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value);
	if (!match) throw new Error(`Invalid version: ${value}`);
	return match.slice(1, 4).map(Number);
}

function normalizeReleaseUrl(value: unknown) {
	if (typeof value !== "string") throw new Error("The latest release has no valid URL");
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.hostname !== "github.com" ||
		!url.pathname.startsWith("/wadib/openscreen/releases/")
	) {
		throw new Error("The latest release URL is not trusted");
	}
	return url.toString();
}
