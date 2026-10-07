import type { RowDefinition } from "dnd-timeline";
import { useRow, useTimelineContext } from "dnd-timeline";

/** Width of the lane-label column on the left of every timeline row. */
export const TIMELINE_LANE_LABEL_WIDTH = 84;

export interface CutSpan {
	startMs: number;
	endMs: number;
}

interface RowProps extends RowDefinition {
	children: React.ReactNode;
	hint?: string;
	isEmpty?: boolean;
	background?: React.ReactNode;
	/** Lane name shown in the label column. */
	label?: string;
	/** Small controls shown under the label (e.g. a transcribe button). */
	labelExtra?: React.ReactNode;
	/** Trimmed sections to shade in this lane, so every lane shows what is cut. */
	cutSpans?: readonly CutSpan[];
	minHeight?: number;
}

/** Hatched shading over trimmed (cut) sections, in the content area right of the labels. */
function CutBands({ spans }: { spans: readonly CutSpan[] }) {
	const { range, valueToPixels } = useTimelineContext();
	return (
		<div
			className="pointer-events-none absolute inset-y-0 right-0 z-[1]"
			style={{ left: TIMELINE_LANE_LABEL_WIDTH }}
			aria-hidden="true"
		>
			{spans
				.filter((span) => span.endMs > range.start && span.startMs < range.end)
				.map((span) => {
					const left = valueToPixels(Math.max(span.startMs, range.start) - range.start);
					const right = valueToPixels(Math.min(span.endMs, range.end) - range.start);
					return (
						<div
							key={`${span.startMs}-${span.endMs}`}
							className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(239,68,68,0.12)_0px,rgba(239,68,68,0.12)_4px,transparent_4px,transparent_8px)]"
							style={{ left, width: Math.max(1, right - left) }}
						/>
					);
				})}
		</div>
	);
}

/**
 * A horizontal timeline lane. Wraps dnd-timeline's `useRow` and adds a label column, an
 * optional `background` layer, cut shading, an empty-state hint label, and a minimum height.
 */
export default function Row({
	id,
	children,
	hint,
	isEmpty,
	background,
	label,
	labelExtra,
	cutSpans,
	minHeight = 36,
}: RowProps) {
	const { setNodeRef, setSidebarRef, rowWrapperStyle, rowStyle, rowSidebarStyle } = useRow({ id });

	return (
		<div
			className="border-b border-white/[0.055] bg-[#101116] relative overflow-hidden w-full"
			style={{ ...rowWrapperStyle, minHeight }}
		>
			<div
				ref={setSidebarRef}
				style={rowSidebarStyle}
				className="sticky z-[5] shrink-0 flex-col justify-center gap-1 border-r border-white/[0.07] bg-[#0d0e12] px-2"
			>
				{label && (
					<span className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/45">
						{label}
					</span>
				)}
				{labelExtra}
			</div>
			{background && (
				<div
					className="pointer-events-none absolute inset-y-0 right-0"
					style={{ left: TIMELINE_LANE_LABEL_WIDTH }}
				>
					{background}
				</div>
			)}
			{cutSpans && cutSpans.length > 0 && <CutBands spans={cutSpans} />}
			{isEmpty && hint && (
				<div
					className="absolute inset-y-0 right-0 flex items-center justify-center pointer-events-none select-none z-10"
					style={{ left: TIMELINE_LANE_LABEL_WIDTH }}
				>
					<span className="text-[11px] text-white/[0.12] font-medium">{hint}</span>
				</div>
			)}
			<div ref={setNodeRef} style={rowStyle}>
				{children}
			</div>
		</div>
	);
}
