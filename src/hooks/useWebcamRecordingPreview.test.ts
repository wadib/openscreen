import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebcamPreviewSignal } from "@/lib/recordingPreview";
import { useRecordingPreviewHost } from "./useRecordingPreviewHost";
import { useWebcamRecordingPreview } from "./useWebcamRecordingPreview";

let receive: (signal: WebcamPreviewSignal) => void;
let peers: FakePeer[];
const send = vi.fn();
const settings = vi.fn();
const unsubscribe = vi.fn();
class FakePeer {
	iceGatheringState = "complete";
	connectionState = "new";
	localDescription = { sdp: "local-sdp" };
	ontrack: ((event: { track: MediaStreamTrack }) => void) | null = null;
	onconnectionstatechange: (() => void) | null = null;
	addTransceiver = vi.fn();
	addTrack = vi.fn();
	setRemoteDescription = vi.fn().mockResolvedValue(undefined);
	setLocalDescription = vi.fn().mockResolvedValue(undefined);
	createOffer = vi.fn().mockResolvedValue({ type: "offer", sdp: "offer-sdp" });
	createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "answer-sdp" });
	close = vi.fn(() => {
		this.connectionState = "closed";
	});
	constructor(public options: RTCConfiguration) {
		peers.push(this);
	}
}
class FakeStream {
	id = "camera-stream";
	constructor(private tracks: MediaStreamTrack[]) {}
	getTracks() {
		return this.tracks;
	}
	getVideoTracks() {
		return this.tracks;
	}
}
beforeEach(() => {
	vi.clearAllMocks();
	peers = [];
	vi.stubGlobal("RTCPeerConnection", FakePeer);
	vi.stubGlobal("MediaStream", FakeStream);
	vi.stubGlobal("electronAPI", {
		onWebcamPreviewSignal: (callback: typeof receive) => {
			receive = callback;
			return unsubscribe;
		},
		sendWebcamPreviewSignal: send,
		setRecordingPreviewSettings: settings,
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("webcam viewer connection", () => {
	it("does not open a camera or connection when disabled", () => {
		const { result } = renderHook(() => useWebcamRecordingPreview(false, 0));
		expect(peers).toHaveLength(0);
		expect(result.current.stream).toBeNull();
	});
	it("receives video-only frames and releases its own connection on disable", async () => {
		const { result, rerender } = renderHook(
			({ enabled }) => useWebcamRecordingPreview(enabled, 0),
			{ initialProps: { enabled: true } },
		);
		await waitFor(() =>
			expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" })),
		);
		expect(peers[0].options.iceServers).toEqual([]);
		expect(peers[0].addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
		const track = { stop: vi.fn(), onended: null } as unknown as MediaStreamTrack;
		act(() => peers[0].ontrack?.({ track }));
		expect(result.current.stream?.getVideoTracks()).toEqual([track]);
		rerender({ enabled: false });
		expect(result.current.stream).toBeNull();
		expect(track.stop).toHaveBeenCalledOnce();
		expect(peers[0].close).toHaveBeenCalledOnce();
	});
	it("ignores stale answers and reports connection errors instead of frozen video", async () => {
		const { result } = renderHook(() => useWebcamRecordingPreview(true, 0));
		await waitFor(() => expect(send).toHaveBeenCalled());
		act(() => receive({ id: "old", type: "answer", sdp: "old-sdp" }));
		expect(peers[0].setRemoteDescription).not.toHaveBeenCalled();
		const id = send.mock.calls[0][0].id;
		await act(async () => receive({ id, type: "answer", sdp: "answer" }));
		expect(peers[0].setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer" });
		act(() => {
			peers[0].connectionState = "failed";
			peers[0].onconnectionstatechange?.();
		});
		expect(result.current.unavailable).toBe(true);
		expect(result.current.stream).toBeNull();
	});
	it("reconnects when the selected camera stream changes", async () => {
		const { rerender } = renderHook(({ id }) => useWebcamRecordingPreview(true, 0, id), {
			initialProps: { id: "first" },
		});
		await waitFor(() => expect(send).toHaveBeenCalled());
		rerender({ id: "second" });
		await waitFor(() => expect(peers).toHaveLength(2));
		expect(peers[0].close).toHaveBeenCalledOnce();
	});
	it("shares recorder tracks without stopping the camera when the viewer closes", async () => {
		const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
		const stream = new FakeStream([track]) as unknown as MediaStream;
		const { unmount } = renderHook(() => useRecordingPreviewHost(stream, "hidden"));
		await act(async () => receive({ id: "viewer", type: "offer", sdp: "offer" }));
		await waitFor(() =>
			expect(send).toHaveBeenCalledWith({ id: "viewer", type: "answer", sdp: "local-sdp" }),
		);
		expect(peers[0].addTrack).toHaveBeenCalledWith(track, stream);
		expect(settings).toHaveBeenCalledWith({
			cursorCaptureMode: "hidden",
			webcamEnabled: true,
			paused: false,
			webcamStreamId: "camera-stream",
		});
		act(() => receive({ id: "", type: "close" }));
		expect(peers[0].close).toHaveBeenCalledOnce();
		expect(track.stop).not.toHaveBeenCalled();
		unmount();
		expect(track.stop).not.toHaveBeenCalled();
	});
});
