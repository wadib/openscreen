import { useScopedT } from "@/contexts/I18nContext";
import {
	type BlurData,
	DEFAULT_BLUR_DATA,
	MAX_BLUR_BLOCK_SIZE,
	MAX_BLUR_INTENSITY,
	MIN_BLUR_BLOCK_SIZE,
	MIN_BLUR_INTENSITY,
} from "./types";

export function BlurControls({
	value,
	onChange,
	onCommit,
}: {
	value?: BlurData;
	onChange: (value: BlurData) => void;
	onCommit?: () => void;
}) {
	const t = useScopedT("settings");
	const data = { ...DEFAULT_BLUR_DATA, ...value };
	const change = (patch: Partial<BlurData>, commit = true) => {
		onChange({ ...data, ...patch });
		if (commit) requestAnimationFrame(() => onCommit?.());
	};
	const gaussian = data.type === "blur";
	const selectClass =
		"h-8 w-full rounded border border-white/15 bg-zinc-900 px-2 text-xs text-zinc-100";
	return (
		<div className="flex flex-col gap-4">
			<label className="flex flex-col gap-1.5 text-xs text-zinc-400">
				{t("annotation.typeBlur")}
				<select
					aria-label={t("annotation.typeBlur")}
					data-testid="blur-effect-type"
					className={selectClass}
					value={data.type}
					onChange={(event) => change({ type: event.target.value as BlurData["type"] })}
				>
					<option value="blur">{t("annotation.blurTypeBlur")}</option>
					<option value="mosaic">{t("annotation.blurTypeMosaic")}</option>
				</select>
			</label>
			<label className="flex flex-col gap-1.5 text-xs text-zinc-400">
				{t("annotation.blurShape")}
				<select
					aria-label={t("annotation.blurShape")}
					className={selectClass}
					value={data.shape}
					onChange={(event) => change({ shape: event.target.value as BlurData["shape"] })}
				>
					<option value="rectangle">{t("annotation.blurShapeRectangle")}</option>
					<option value="oval">{t("annotation.blurShapeOval")}</option>
					{data.shape === "freehand" && (
						<option value="freehand">{t("annotation.blurShapeFreehand")}</option>
					)}
				</select>
			</label>
			<fieldset className="text-xs text-zinc-400">
				<legend className="mb-2">{t("annotation.blurColor")}</legend>
				<div className="flex gap-2">
					{(["white", "black"] as const).map((color) => (
						<button
							key={color}
							type="button"
							title={t(
								color === "white" ? "annotation.blurColorWhite" : "annotation.blurColorBlack",
							)}
							aria-label={t(
								color === "white" ? "annotation.blurColorWhite" : "annotation.blurColorBlack",
							)}
							aria-pressed={data.color === color}
							onClick={() => change({ color })}
							className={`h-7 w-7 rounded border ${data.color === color ? "border-emerald-400 ring-1 ring-emerald-400" : "border-white/30"}`}
							style={{ backgroundColor: color }}
						/>
					))}
				</div>
			</fieldset>
			<label className="flex flex-col gap-2 text-xs text-zinc-400">
				<span className="flex justify-between gap-2">
					<span>{t(gaussian ? "annotation.blurIntensity" : "annotation.mosaicBlockSize")}</span>
					<output className="shrink-0 font-mono">
						{Math.round(gaussian ? data.intensity : data.blockSize)} px
					</output>
				</span>
				<input
					type="range"
					aria-label={t(gaussian ? "annotation.blurIntensity" : "annotation.mosaicBlockSize")}
					data-testid="blur-strength"
					className="my-2 h-1.5 w-full rounded-full bg-zinc-700 accent-green-500"
					min={gaussian ? MIN_BLUR_INTENSITY : MIN_BLUR_BLOCK_SIZE}
					max={gaussian ? MAX_BLUR_INTENSITY : MAX_BLUR_BLOCK_SIZE}
					step={1}
					value={gaussian ? data.intensity : data.blockSize}
					onChange={(event) =>
						change(
							gaussian
								? { intensity: Number(event.target.value) }
								: { blockSize: Number(event.target.value) },
							false,
						)
					}
					onPointerUp={() => onCommit?.()}
					onKeyUp={() => onCommit?.()}
					onBlur={() => onCommit?.()}
				/>
			</label>
		</div>
	);
}
