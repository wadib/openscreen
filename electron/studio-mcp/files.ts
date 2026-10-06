import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class StudioFiles {
	private constructor(private readonly roots: string[]) {}
	static async create(roots: string[]) {
		if (!roots.length || roots.length > 20)
			throw new Error("Grant 1..20 local folders with --root");
		return new StudioFiles(
			await Promise.all(
				roots.map(async (root) => {
					const local = localPath(root);
					const real = await fs.realpath(local);
					if (!(await fs.stat(real)).isDirectory())
						throw new Error("Allowed root must be a directory");
					return real;
				}),
			),
		);
	}
	private check(real: string) {
		if (
			!this.roots.some((root) => {
				const relative = path.relative(root, real);
				return (
					relative === "" ||
					(!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
				);
			})
		)
			throw new Error("Path is outside granted Studio folders");
		return real;
	}
	async readPath(value: string) {
		const real = this.check(await fs.realpath(localPath(value)));
		if (!(await fs.stat(real)).isFile()) throw new Error("Expected a local file");
		return real;
	}
	async newPath(value: string, extension: string) {
		const local = localPath(value);
		if (path.extname(local).toLowerCase() !== extension)
			throw new Error(`Output must end in ${extension}`);
		const parent = this.check(await fs.realpath(path.dirname(local)));
		if (
			process.platform === "win32" &&
			/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(path.basename(local))
		)
			throw new Error("Reserved device filenames are not allowed");
		const output = this.check(path.join(parent, path.basename(local)));
		try {
			await fs.lstat(output);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return output;
			throw error;
		}
		throw new Error("Output already exists; choose a new file name");
	}
	async writeNew(value: string, extension: string, data: string | Uint8Array) {
		const output = await this.newPath(value, extension);
		const handle = await fs.open(output, "wx", 0o600);
		try {
			await handle.writeFile(data);
			await handle.sync();
		} catch (error) {
			await handle.close();
			await fs.unlink(output).catch(() => undefined);
			throw error;
		}
		await handle.close();
		return output;
	}
	async loadProject(value: string) {
		const file = await this.readPath(value);
		if (path.extname(file).toLowerCase() !== ".openscreen")
			throw new Error("Expected an .openscreen project");
		if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error("Project exceeds 8 MiB");
		const project = JSON.parse(await fs.readFile(file, "utf8"));
		if (
			!project ||
			!project.editor ||
			typeof project.editor !== "object" ||
			![1, 2].includes(project.version)
		)
			throw new Error("Invalid project");
		const media = project.media ?? { screenVideoPath: project.videoPath };
		if (!media.screenVideoPath) throw new Error("Project has no screen video");
		for (const key of ["screenVideoPath", "webcamVideoPath", "microphoneAudioPath"]) {
			if (media[key] !== undefined) media[key] = await this.readPath(media[key]);
		}
		const wallpaper = project.editor.wallpaper;
		if (
			wallpaper &&
			!/^#[\da-f]{3,8}$/i.test(wallpaper) &&
			!/^\/wallpapers\/wallpaper\d+\.jpg$/.test(wallpaper)
		) {
			project.editor.wallpaper = await this.readPath(wallpaper);
		}
		for (const annotation of project.editor.annotationRegions ?? []) {
			if (annotation.type === "image") {
				const image = annotation.imageContent ?? annotation.content;
				if (
					typeof image !== "string" ||
					!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(image)
				)
					throw new Error(
						"Agent projects must embed raster annotation images; external image paths are not allowed",
					);
			}
		}
		return { path: file, project: { ...project, media } };
	}
}

function localPath(value: string) {
	if (typeof value !== "string" || !value || value.includes("\0"))
		throw new Error("Invalid local path");
	const local = value.startsWith("file:") ? fileURLToPath(value) : value;
	if (
		!path.isAbsolute(local) ||
		/^[\\/]{2}/.test(local) ||
		(process.platform === "win32" && (!/^[a-z]:[\\/]/i.test(local) || local.slice(2).includes(":")))
	) {
		throw new Error("Only absolute local filesystem paths are allowed");
	}
	return local;
}
