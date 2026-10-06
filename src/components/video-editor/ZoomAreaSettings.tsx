import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import type { ZoomArea } from "./types";

function AreaDimensionInput({
	value,
	label,
	dimension,
	onChange,
	onCommit,
}: {
	value: number;
	label: string;
	dimension: string;
	onChange: (value: number) => void;
	onCommit: () => void;
}) {
	const [draft, setDraft] = useState(String(Math.round(value * 1000) / 10));
	useEffect(() => setDraft(String(Math.round(value * 1000) / 10)), [value]);
	return (
		<input
			type="number"
			min={5}
			max={100}
			step={0.1}
			aria-label={label}
			data-testid={`zoom-area-${dimension}`}
			value={draft}
			onChange={(event) => {
				setDraft(event.currentTarget.value);
				const number = event.currentTarget.valueAsNumber;
				if (Number.isFinite(number) && number >= 5 && number <= 100) onChange(number / 100);
			}}
			onBlur={() => {
				const parsed = draft.trim() ? Number(draft) : NaN;
				const next = Number.isFinite(parsed) ? Math.max(5, Math.min(100, parsed)) / 100 : value;
				setDraft(String(Math.round(next * 1000) / 10));
				onChange(next);
				onCommit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
			className="mt-1 h-7 w-full min-w-0 rounded border border-white/10 bg-white/5 px-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#34B27B]"
		/>
	);
}

export function ZoomAreaSettings({
	area,
	onToggle,
	onChange,
	onCommit,
}: {
	area?: ZoomArea;
	onToggle: (enabled: boolean) => void;
	onChange: (area: ZoomArea) => void;
	onCommit: () => void;
}) {
	const t = useScopedT("settings");
	return (
		<div className="space-y-2">
			<label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
				{t("zoom.area.title")}
				<Switch checked={!!area} onCheckedChange={onToggle} aria-label={t("zoom.area.title")} />
			</label>
			{area && (
				<>
					<div className="grid grid-cols-2 gap-2">
						{(["width", "height"] as const).map((dimension) => (
							<label key={dimension} className="min-w-0 text-[10px] text-slate-400">
								{t(`zoom.area.${dimension}`)} (%)
								<AreaDimensionInput
									value={area[dimension]}
									label={`${t(`zoom.area.${dimension}`)} (%)`}
									dimension={dimension}
									onChange={(value) => onChange({ ...area, [dimension]: value })}
									onCommit={onCommit}
								/>
							</label>
						))}
					</div>
					<div
						role="radiogroup"
						aria-label={t("zoom.area.framing")}
						className="grid grid-cols-2 gap-1"
					>
						{(["fit", "fill"] as const).map((fit) => (
							<label key={fit} className="min-w-0 cursor-pointer">
								<input
									type="radio"
									name="zoom-area-framing"
									aria-label={t(`zoom.area.${fit}`)}
									checked={area.fit === fit}
									onChange={() => {
										onChange({ ...area, fit });
										onCommit();
									}}
									className="peer sr-only"
								/>
								<span className="flex h-7 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] text-slate-400 peer-checked:border-[#34B27B]/60 peer-checked:bg-[#34B27B]/15 peer-checked:text-[#34B27B] peer-focus-visible:ring-1 peer-focus-visible:ring-[#34B27B]">
									{t(`zoom.area.${fit}`)}
								</span>
							</label>
						))}
					</div>
				</>
			)}
		</div>
	);
}
