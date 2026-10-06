import { Rnd } from "react-rnd";
import { MIN_ZOOM_AREA_SIZE, type ZoomArea, type ZoomFocus } from "./types";

export function ZoomAreaOverlay({
	area,
	focus,
	width,
	height,
	onChange,
	onCommit,
}: {
	area: ZoomArea;
	focus: ZoomFocus;
	width: number;
	height: number;
	onChange: (area: ZoomArea, focus: ZoomFocus) => void;
	onCommit: () => void;
}) {
	if (width <= 0 || height <= 0) return null;
	const rect = {
		x: (focus.cx - area.width / 2) * width,
		y: (focus.cy - area.height / 2) * height,
		width: area.width * width,
		height: area.height * height,
	};
	const update = (x: number, y: number, w: number, h: number) =>
		onChange(
			{ ...area, width: w / width, height: h / height },
			{ cx: (x + w / 2) / width, cy: (y + h / 2) / height },
		);
	const handle = <div className="h-2.5 w-2.5 border border-[#34B27B] bg-white" />;
	const handleStyle = { display: "flex", alignItems: "center", justifyContent: "center" };
	const resize = (direction: string, element: HTMLElement, position: { x: number; y: number }) => {
		const horizontalOnly = direction === "left" || direction === "right";
		const verticalOnly = direction === "top" || direction === "bottom";
		update(
			verticalOnly ? rect.x : position.x,
			horizontalOnly ? rect.y : position.y,
			verticalOnly ? rect.width : parseFloat(element.style.width),
			horizontalOnly ? rect.height : parseFloat(element.style.height),
		);
	};
	return (
		<Rnd
			data-testid="zoom-area-selection"
			position={{ x: rect.x, y: rect.y }}
			size={{ width: rect.width, height: rect.height }}
			minWidth={width * MIN_ZOOM_AREA_SIZE}
			minHeight={height * MIN_ZOOM_AREA_SIZE}
			bounds="parent"
			lockAspectRatio={false}
			className="border border-[#34B27B] bg-[#34B27B]/5"
			style={{ pointerEvents: "auto", zIndex: 40 }}
			onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
			onDrag={(_event, data) => update(data.x, data.y, rect.width, rect.height)}
			onDragStop={(_event, data) => {
				update(data.x, data.y, rect.width, rect.height);
				onCommit();
			}}
			onResize={(_event, direction, element, _delta, position) =>
				resize(direction, element, position)
			}
			onResizeStop={(_event, direction, element, _delta, position) => {
				resize(direction, element, position);
				onCommit();
			}}
			resizeHandleComponent={{
				topLeft: handle,
				topRight: handle,
				bottomLeft: handle,
				bottomRight: handle,
				top: handle,
				right: handle,
				bottom: handle,
				left: handle,
			}}
			resizeHandleStyles={{
				topLeft: handleStyle,
				topRight: handleStyle,
				bottomLeft: handleStyle,
				bottomRight: handleStyle,
				top: handleStyle,
				right: handleStyle,
				bottom: handleStyle,
				left: handleStyle,
			}}
			resizeHandleClasses={{
				right: "zoom-area-resize-right",
				bottom: "zoom-area-resize-bottom",
				bottomRight: "zoom-area-resize-corner",
			}}
		/>
	);
}
