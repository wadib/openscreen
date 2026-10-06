export const CAMERA_CONTROL_IDS = [
	"brightness",
	"contrast",
	"hue",
	"saturation",
	"sharpness",
	"gamma",
	"whiteBalance",
	"backlightCompensation",
	"gain",
	"pan",
	"tilt",
	"roll",
	"zoom",
	"exposure",
	"iris",
	"focus",
] as const;

export type CameraControlId = (typeof CAMERA_CONTROL_IDS)[number];

export interface CameraControl {
	id: CameraControlId;
	label: string;
	min: number;
	max: number;
	step: number;
	defaultValue: number;
	value: number;
	autoSupported: boolean;
	manualSupported: boolean;
	automatic: boolean;
}

export interface CameraControlsResult {
	success: boolean;
	controls?: CameraControl[];
	control?: CameraControl;
	error?: string;
}

export interface SetCameraControlRequest {
	deviceName: string;
	property: CameraControlId;
	value: number;
	automatic: boolean;
}
