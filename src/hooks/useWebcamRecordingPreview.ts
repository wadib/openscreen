import { useEffect, useState } from "react";
import { gatherPreviewDescription } from "@/lib/recordingPreview";

export function useWebcamRecordingPreview(enabled: boolean, retryId: number, streamId?: string) {
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [unavailable, setUnavailable] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Retry must reconnect the same webcam.
	useEffect(() => {
		setStream(null);
		setUnavailable(false);
		if (!enabled) return;
		let disposed = false;
		let received: MediaStream | null = null;
		const id = crypto.randomUUID();
		const peer = new RTCPeerConnection({ iceServers: [] });
		peer.addTransceiver("video", { direction: "recvonly" });
		const fail = () => {
			if (disposed) return;
			setStream(null);
			setUnavailable(true);
		};
		peer.ontrack = (event) => {
			if (disposed) return;
			received = new MediaStream([event.track]);
			event.track.onended = fail;
			setStream(received);
		};
		peer.onconnectionstatechange = () => {
			if (peer.connectionState === "failed" || peer.connectionState === "closed") fail();
		};
		const unsubscribe = window.electronAPI.onWebcamPreviewSignal((signal) => {
			if (signal.id !== id) return;
			if (signal.type === "close") {
				peer.close();
				fail();
			} else if (signal.type === "answer" && signal.sdp) {
				void peer.setRemoteDescription({ type: "answer", sdp: signal.sdp }).catch(fail);
			}
		});
		void (async () => {
			await peer.setLocalDescription(await peer.createOffer());
			const sdp = await gatherPreviewDescription(peer);
			if (!disposed) window.electronAPI.sendWebcamPreviewSignal({ id, type: "offer", sdp });
		})().catch(fail);
		const timeout = setTimeout(() => {
			if (peer.connectionState !== "connected") fail();
		}, 15_000);
		return () => {
			disposed = true;
			clearTimeout(timeout);
			unsubscribe();
			peer.close();
			received?.getTracks().forEach((track) => track.stop());
			window.electronAPI.sendWebcamPreviewSignal({ id, type: "close" });
		};
	}, [enabled, retryId, streamId]);
	return { stream: enabled ? stream : null, unavailable: enabled && unavailable };
}
