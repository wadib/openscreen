import { computeCompositeLayout, type Size } from "./compositeLayout";
import type { CursorCaptureMode } from "./recordingSession";

export interface RecordingPreviewSettings {
	cursorCaptureMode: CursorCaptureMode;
	webcamEnabled: boolean;
	paused: boolean;
	webcamStreamId?: string;
}

export type WebcamPreviewSignal = {
	id: string;
	type: "offer" | "answer" | "close";
	sdp?: string;
};

export function computeRecordingPreviewLayout(stageSize: Size, screenSize: Size, webcamSize: Size) {
	const fitted = computeCompositeLayout({ canvasSize: stageSize, screenSize });
	const composition = computeCompositeLayout({ canvasSize: screenSize, screenSize, webcamSize });
	if (!fitted || !composition) return null;
	const scale = fitted.screenRect.width / screenSize.width;
	const webcam = composition.webcamRect;
	return {
		screenRect: fitted.screenRect,
		webcamRect: webcam
			? {
					...webcam,
					x: fitted.screenRect.x + webcam.x * scale,
					y: fitted.screenRect.y + webcam.y * scale,
					width: webcam.width * scale,
					height: webcam.height * scale,
					borderRadius: webcam.borderRadius * scale,
				}
			: null,
	};
}

// Include local ICE candidates in SDP; this connection has no signaling server or STUN service.
export async function gatherPreviewDescription(peer: RTCPeerConnection) {
	if (peer.iceGatheringState !== "complete") {
		await new Promise<void>((resolve, reject) => {
			const finish = () => {
				clearTimeout(timeout);
				peer.removeEventListener("icegatheringstatechange", changed);
				peer.removeEventListener("connectionstatechange", changed);
			};
			const changed = () => {
				if (peer.connectionState === "closed") {
					finish();
					reject(new Error("Webcam preview closed"));
				} else if (peer.iceGatheringState === "complete") {
					finish();
					resolve();
				}
			};
			const timeout = setTimeout(() => {
				finish();
				reject(new Error("Webcam preview connection timed out"));
			}, 8_000);
			peer.addEventListener("icegatheringstatechange", changed);
			peer.addEventListener("connectionstatechange", changed);
			changed();
		});
	}
	if (!peer.localDescription?.sdp) throw new Error("Missing webcam preview description");
	return peer.localDescription.sdp;
}
