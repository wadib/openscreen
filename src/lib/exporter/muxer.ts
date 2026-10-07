import {
	AudioSample,
	AudioSampleSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	Output,
} from "mediabunny";
import type { ExportConfig } from "./types";

export type ExportAudioMuxerCodec = "aac" | "opus";

/**
 * "packets": the caller encodes with WebCodecs and passes encoded chunks.
 * "samples": the caller passes raw audio and Mediabunny encodes it (used for the
 * WebAssembly AAC encoder on platforms without a native AAC encoder, e.g. Linux).
 */
export type ExportAudioInput = "packets" | "samples";

export class VideoMuxer {
	private output: Output | null = null;
	private videoSource: EncodedVideoPacketSource | null = null;
	private audioSource: EncodedAudioPacketSource | null = null;
	private audioSampleSource: AudioSampleSource | null = null;
	private hasAudio: boolean;
	private target: BufferTarget | null = null;
	private config: ExportConfig;
	private audioCodec: ExportAudioMuxerCodec;
	private audioInput: ExportAudioInput;
	private audioBitrate: number;

	constructor(
		config: ExportConfig,
		hasAudio = false,
		audioCodec: ExportAudioMuxerCodec = "aac",
		audioInput: ExportAudioInput = "packets",
		audioBitrate = 128_000,
	) {
		this.config = config;
		this.hasAudio = hasAudio;
		this.audioCodec = audioCodec;
		this.audioInput = audioInput;
		this.audioBitrate = audioBitrate;
	}

	get acceptsAudioSamples(): boolean {
		return this.audioInput === "samples";
	}

	async initialize(): Promise<void> {
		this.target = new BufferTarget();

		this.output = new Output({
			format: new Mp4OutputFormat({
				fastStart: "in-memory",
			}),
			target: this.target,
		});

		// Codec is deduced from the chunk metadata.
		this.videoSource = new EncodedVideoPacketSource("avc");
		this.output.addVideoTrack(this.videoSource, {
			frameRate: this.config.frameRate,
		});

		if (this.hasAudio && this.audioInput === "samples") {
			this.audioSampleSource = new AudioSampleSource({
				codec: this.audioCodec,
				bitrate: this.audioBitrate,
			});
			this.output.addAudioTrack(this.audioSampleSource);
		} else if (this.hasAudio) {
			this.audioSource = new EncodedAudioPacketSource(this.audioCodec);
			this.output.addAudioTrack(this.audioSource);
		}

		await this.output.start();
	}

	async addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void> {
		if (!this.videoSource) {
			throw new Error("Muxer not initialized");
		}

		const packet = EncodedPacket.fromEncodedChunk(chunk);

		await this.videoSource.add(packet, meta);
	}

	async addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void> {
		if (!this.audioSource) {
			throw new Error("Audio not configured for this muxer");
		}

		const packet = EncodedPacket.fromEncodedChunk(chunk);

		await this.audioSource.add(packet, meta);
	}

	/** Encode and add raw audio. Only for muxers created with audioInput "samples". */
	async addAudioSample(sample: AudioSample): Promise<void> {
		if (!this.audioSampleSource) {
			throw new Error("Muxer does not accept raw audio samples");
		}
		try {
			await this.audioSampleSource.add(sample);
		} finally {
			sample.close();
		}
	}

	async finalize(): Promise<Blob> {
		if (!this.output || !this.target) {
			throw new Error("Muxer not initialized");
		}

		await this.output.finalize();
		const buffer = this.target.buffer;

		if (!buffer) {
			throw new Error("Failed to finalize output");
		}

		return new Blob([buffer], { type: "video/mp4" });
	}
}
