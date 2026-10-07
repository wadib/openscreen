import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Portable projects: a saved project also records each media path relative to the project
 * file, so a project folder copied to another machine or drive (for example from Windows to
 * Linux) still finds its recordings. Absolute paths stay the primary reference.
 */

export const PROJECT_MEDIA_PATH_KEYS = [
	"screenVideoPath",
	"webcamVideoPath",
	"microphoneAudioPath",
] as const;
type MediaPathKey = (typeof PROJECT_MEDIA_PATH_KEYS)[number];
type RelativePaths = Partial<Record<MediaPathKey, string>>;

interface ProjectLike {
	media?: Record<string, unknown> & { relativePaths?: unknown };
	videoPath?: unknown;
}

function toLocalPath(value: string): string {
	return value.startsWith("file:") ? fileURLToPath(value) : value;
}

/** Last path segment, accepting both Windows and POSIX separators. */
export function crossPlatformBasename(value: string): string {
	return value.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

/** Relative path from the project folder in "/" form, or null when there is none (other drive). */
export function relativeMediaPath(projectFilePath: string, mediaPath: string): string | null {
	const local = toLocalPath(mediaPath);
	if (!path.isAbsolute(local)) return null;
	const relative = path.relative(path.dirname(path.resolve(projectFilePath)), local);
	if (!relative || path.isAbsolute(relative)) return null;
	return relative.split(path.sep).join("/");
}

/** Copy of the project with media.relativePaths filled in for saving. */
export function withPortableMediaPaths<T>(projectData: T, projectFilePath: string): T {
	if (!projectData || typeof projectData !== "object") return projectData;
	const project = projectData as ProjectLike;
	if (!project.media || typeof project.media !== "object") return projectData;
	const relativePaths: RelativePaths = {};
	for (const key of PROJECT_MEDIA_PATH_KEYS) {
		const value = project.media[key];
		if (typeof value !== "string" || !value.trim()) continue;
		const relative = relativeMediaPath(projectFilePath, value);
		if (relative) relativePaths[key] = relative;
	}
	const { relativePaths: _previous, ...media } = project.media;
	return {
		...projectData,
		media: Object.keys(relativePaths).length ? { ...media, relativePaths } : media,
	} as T;
}

async function isFile(candidate: string): Promise<boolean> {
	try {
		return (await fs.stat(candidate)).isFile();
	} catch {
		return false;
	}
}

/**
 * Candidates for a media file that is missing at its absolute path: the stored relative path,
 * then a file of the same name next to the project. Both stay inside the project folder, the
 * same folder the main process already trusts for project media, so a crafted project cannot
 * point reads elsewhere.
 */
export function mediaPathCandidates(
	projectFilePath: string,
	absolutePath: string | undefined,
	relativePath: string | undefined,
): string[] {
	const projectDir = path.dirname(path.resolve(projectFilePath));
	const candidates: string[] = [];
	if (relativePath) {
		const parts = relativePath.split(/[\\/]/).filter(Boolean);
		if (parts.length && !parts.includes("..") && !/^[a-z]:$/i.test(parts[0])) {
			candidates.push(path.join(projectDir, ...parts));
		}
	}
	const name = absolutePath ? crossPlatformBasename(absolutePath) : "";
	if (name) candidates.push(path.join(projectDir, name));
	return [...new Set(candidates)];
}

/**
 * Point missing media at its portable location. Returns the project unchanged when every
 * absolute path exists; otherwise a copy with the found paths substituted, plus the keys
 * that moved. Media that cannot be found is left as-is so the editor can report it.
 */
export async function resolvePortableMediaPaths<T>(
	projectData: T,
	projectFilePath: string,
	exists: (candidate: string) => Promise<boolean> = isFile,
): Promise<{ project: T; remapped: MediaPathKey[] }> {
	if (!projectData || typeof projectData !== "object")
		return { project: projectData, remapped: [] };
	const project = projectData as ProjectLike;
	const legacy = !project.media && typeof project.videoPath === "string";
	const media: Record<string, unknown> | undefined = legacy
		? { screenVideoPath: project.videoPath }
		: project.media;
	if (!media || typeof media !== "object") return { project: projectData, remapped: [] };

	const relativePaths =
		media.relativePaths && typeof media.relativePaths === "object"
			? (media.relativePaths as RelativePaths)
			: {};
	const resolved: Record<string, unknown> = { ...media };
	const remapped: MediaPathKey[] = [];
	for (const key of PROJECT_MEDIA_PATH_KEYS) {
		const absolute = typeof media[key] === "string" ? (media[key] as string) : undefined;
		const relative = typeof relativePaths[key] === "string" ? relativePaths[key] : undefined;
		if (!absolute && !relative) continue;
		if (absolute && path.isAbsolute(toLocalPath(absolute)) && (await exists(toLocalPath(absolute))))
			continue;
		for (const candidate of mediaPathCandidates(projectFilePath, absolute, relative)) {
			if (await exists(candidate)) {
				resolved[key] = candidate;
				remapped.push(key);
				break;
			}
		}
	}
	if (!remapped.length) return { project: projectData, remapped };
	if (legacy) {
		return { project: { ...projectData, videoPath: resolved.screenVideoPath } as T, remapped };
	}
	return { project: { ...projectData, media: resolved } as T, remapped };
}
