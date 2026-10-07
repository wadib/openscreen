import fs from "node:fs/promises";
import path from "node:path";

/**
 * Headless command-line export:
 *
 *   Openscreen --export project.openscreen out.mp4 [--export other.openscreen other.mp4 ...]
 *   Openscreen --export-dir <folder with .openscreen files> <output folder>
 *   options: --quality medium|good|source   --overwrite   --show
 *
 * Jobs run one after another in a hidden editor window; progress goes to stdout and the
 * process exits with 0 when every job succeeded, 1 otherwise.
 */

export type CliExportQuality = "medium" | "good" | "source";

export interface CliExportJob {
	project: string;
	output: string;
}

export interface CliExportRequest {
	jobs: CliExportJob[];
	exportDirs: Array<{ folder: string; outputDir: string }>;
	quality: CliExportQuality;
	overwrite: boolean;
	show: boolean;
}

export class CliUsageError extends Error {}

export function isCliExportInvocation(argv: readonly string[]): boolean {
	return argv.includes("--export") || argv.includes("--export-dir");
}

export function parseCliExportArgs(
	argv: readonly string[],
	cwd = process.cwd(),
): CliExportRequest | null {
	if (!isCliExportInvocation(argv)) return null;
	const request: CliExportRequest = {
		jobs: [],
		exportDirs: [],
		quality: "good",
		overwrite: false,
		show: false,
	};
	const value = (index: number, flag: string) => {
		const next = argv[index];
		if (next === undefined || next.startsWith("--")) {
			throw new CliUsageError(`${flag} needs a value`);
		}
		return next;
	};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--export") {
			const project = path.resolve(cwd, value(index + 1, "--export"));
			const output = path.resolve(cwd, value(index + 2, "--export <project>"));
			if (path.extname(project).toLowerCase() !== ".openscreen") {
				throw new CliUsageError(`Not an .openscreen project: ${project}`);
			}
			if (path.extname(output).toLowerCase() !== ".mp4") {
				throw new CliUsageError(`Output must end in .mp4: ${output}`);
			}
			request.jobs.push({ project, output });
			index += 2;
		} else if (arg === "--export-dir") {
			request.exportDirs.push({
				folder: path.resolve(cwd, value(index + 1, "--export-dir")),
				outputDir: path.resolve(cwd, value(index + 2, "--export-dir <folder>")),
			});
			index += 2;
		} else if (arg === "--quality") {
			const quality = value(index + 1, "--quality");
			if (quality !== "medium" && quality !== "good" && quality !== "source") {
				throw new CliUsageError("--quality must be medium, good or source");
			}
			request.quality = quality;
			index += 1;
		} else if (arg === "--overwrite") {
			request.overwrite = true;
		} else if (arg === "--show") {
			request.show = true;
		}
	}
	return request;
}

/** Expand --export-dir folders into jobs (sorted by name) and drop jobs whose output exists. */
export async function resolveCliExportJobs(
	request: CliExportRequest,
	exists: (file: string) => Promise<boolean> = async (file) =>
		fs
			.stat(file)
			.then(() => true)
			.catch(() => false),
	listDir: (folder: string) => Promise<string[]> = (folder) => fs.readdir(folder),
): Promise<{ jobs: CliExportJob[]; skipped: CliExportJob[] }> {
	const all: CliExportJob[] = [...request.jobs];
	for (const { folder, outputDir } of request.exportDirs) {
		const names = (await listDir(folder))
			.filter((name) => name.toLowerCase().endsWith(".openscreen"))
			.sort((a, b) => a.localeCompare(b));
		for (const name of names) {
			all.push({
				project: path.join(folder, name),
				output: path.join(outputDir, `${name.slice(0, -".openscreen".length)}.mp4`),
			});
		}
	}
	const jobs: CliExportJob[] = [];
	const skipped: CliExportJob[] = [];
	for (const job of all) {
		if (!(await exists(job.project))) throw new CliUsageError(`Project not found: ${job.project}`);
		if (!request.overwrite && (await exists(job.output))) skipped.push(job);
		else jobs.push(job);
	}
	return { jobs, skipped };
}

export const CLI_USAGE = `Openscreen command-line export

  Openscreen --export <project.openscreen> <out.mp4> [--export ...]
  Openscreen --export-dir <projects folder> <output folder>

Options:
  --quality medium|good|source   Export quality (default: good)
  --overwrite                    Replace existing output files (default: skip them)
  --show                         Show the editor window while exporting
`;
