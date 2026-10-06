import { useEffect } from "react";
import { gatherPreviewDescription } from "@/lib/recordingPreview";
import type { CursorCaptureMode } from "@/lib/recordingSession";

export function useRecordingPreviewHost(
	stream: MediaStream | null,
	cursorCaptureMode: CursorCaptureMode,
	paused = false,
) {
	useEffect(() => {
		window.electronAPI?.setRecordingPreviewSettings?.({
			cursorCaptureMode,
			webcamEnabled: Boolean(stream),
			paused,
			webcamStreamId: stream?.id,
		});
	}, [stream, cursorCaptureMode, paused]);

	useEffect(() => {
		if (!stream || !window.electronAPI?.onWebcamPreviewSignal) return;
		let disposed = false;
		let active: { id: string; peer: RTCPeerConnection } | null = null;
		const unsubscribe = window.electronAPI.onWebcamPreviewSignal((signal) => {
			if (signal.type === "close" && active && (!signal.id || active.id === signal.id)) {
				active.peer.close();
				active = null;
				return;
			}
			if (signal.type !== "offer" || !signal.sdp) return;
			active?.peer.close();
			const peer = new RTCPeerConnection({ iceServers: [] });
			active = { id: signal.id, peer };
			for (const track of stream.getVideoTracks()) peer.addTrack(track, stream);
			void (async () => {
				await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
				await peer.setLocalDescription(await peer.createAnswer());
				const sdp = await gatherPreviewDescription(peer);
				if (disposed || active?.peer !== peer) return;
				window.electronAPI.sendWebcamPreviewSignal({ id: signal.id, type: "answer", sdp });
			})().catch(() => {
				peer.close();
				if (!disposed && active?.peer === peer) {
					window.electronAPI.sendWebcamPreviewSignal({ id: signal.id, type: "close" });
				}
			});
		});
		return () => {
			disposed = true;
			unsubscribe();
			active?.peer.close();
			// The camera tracks belong to the recorder, never to a preview connection.
		};
	}, [stream]);
}
