import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { quietRecordingCommand } from "./quiet-recording-scripts";

export type QuietSupport = { available: boolean; detail: string };
type Lease = { backend: string; release: () => Promise<void> };
type Spawn = typeof spawn;

const windowsGuardian = String.raw`
const { spawn } = require("node:child_process");
const child = spawn(process.argv[1], process.argv.slice(2), { windowsHide: true, stdio: "pipe" });
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
child.stdin.on("error", () => {});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("error", error => { process.stdout.write(JSON.stringify({ error: error.message }) + "\n"); process.exitCode = 1; });
child.on("close", code => { process.exitCode = code === 0 ? 0 : 1; process.stdin.destroy(); });
`;

export async function launchQuietRecording(
	platform: NodeJS.Platform,
	probe = false,
	onLost?: (error: string) => void,
	spawnProcess: Spawn = spawn,
): Promise<Lease> {
	const command = quietRecordingCommand(platform);
	// Detached PowerShell loses its console I/O on Windows; a hidden Node host keeps
	// the protocol working and lets restoration survive Electron's Windows job exit.
	const guarded = platform === "win32" && !probe;
	const child = spawnProcess(
		guarded ? process.execPath : command.file,
		guarded ? ["-e", windowsGuardian, "--", command.file, ...command.args] : command.args,
		{
			windowsHide: true,
			detached: guarded,
			stdio: "pipe",
			env: {
				...process.env,
				OPENSCREEN_QUIET_PROBE: probe ? "1" : "0",
				OPENSCREEN_QUIET_PARENT_PID: String(process.pid),
				...(guarded ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
			},
		},
	) as ChildProcessWithoutNullStreams;
	let failure = "";
	let releasing = probe;
	let ready = false;
	let stderr = "";
	let resolveReady: (backend: string) => void;
	let rejectReady: (error: Error) => void;
	const started = new Promise<string>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	const timer = setTimeout(() => {
		failure = "Quiet recording did not respond. Recording was not started.";
		child.stdin.end();
		rejectReady(new Error(failure));
	}, 20_000);
	child.stdin.on("error", () => undefined);
	child.stderr.on("data", (chunk) => {
		stderr = (stderr + String(chunk)).slice(-4000);
	});
	const lines = createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		try {
			const value = JSON.parse(line);
			if (typeof value.error === "string") {
				failure = value.error;
				if (!ready) {
					clearTimeout(timer);
					child.stdin.end();
					rejectReady(new Error(failure));
				}
			} else if (value.ready === true && typeof value.backend === "string") {
				ready = true;
				clearTimeout(timer);
				resolveReady(value.backend);
			}
		} catch {
			// Native tools can emit diagnostics before the JSON handshake.
		}
	});
	const exited = new Promise<void>((resolve, reject) => {
		child.once("error", (error) => {
			clearTimeout(timer);
			rejectReady(error);
			reject(error);
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			lines.close();
			const message = failure || stderr || "Quiet recording helper stopped unexpectedly";
			if (!ready) rejectReady(new Error(message));
			if (ready && !releasing) onLost?.(message);
			if (failure || code !== 0) reject(new Error(message));
			else resolve();
		});
	});
	void exited.catch(() => undefined);
	let releasePromise: Promise<void> | undefined;
	const release = () => {
		if (!releasePromise) {
			releasing = true;
			child.stdin.end();
			releasePromise = new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() =>
						reject(
							new Error("Notification restoration is still pending. Check your system quiet mode."),
						),
					20_000,
				);
				exited.then(resolve, reject).finally(() => clearTimeout(timeout));
			});
		}
		return releasePromise;
	};
	try {
		const backend = await started;
		if (probe) await release();
		return { backend, release };
	} catch (error) {
		await release().catch(() => undefined);
		throw error;
	}
}

export class QuietRecordingController {
	private lease: Lease | undefined;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(private readonly acquire: () => Promise<Lease>) {}

	start(): Promise<void> {
		return this.serialize(async () => {
			if (!this.lease) this.lease = await this.acquire();
		});
	}

	stop(): Promise<void> {
		return this.serialize(async () => {
			const lease = this.lease;
			this.lease = undefined;
			await lease?.release();
		});
	}

	private serialize(work: () => Promise<void>): Promise<void> {
		const next = this.queue.then(work);
		this.queue = next.catch(() => undefined);
		return next;
	}
}

export async function getQuietRecordingSupport(): Promise<QuietSupport> {
	try {
		const lease = await launchQuietRecording(process.platform, true);
		return { available: true, detail: lease.backend };
	} catch (error) {
		return { available: false, detail: error instanceof Error ? error.message : String(error) };
	}
}
