import { Trash2 } from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { BlurControls } from "./BlurControls";
import type { AnnotationRegion, BlurData } from "./types";

export function BlurSettingsPanel({
	blurRegion,
	onBlurDataChange,
	onBlurDataCommit,
	onDelete,
}: {
	blurRegion: AnnotationRegion;
	onBlurDataChange: (value: BlurData) => void;
	onBlurDataCommit?: () => void;
	onDelete: () => void;
}) {
	const t = useScopedT("settings");
	return (
		<div className="flex h-full min-w-0 flex-col gap-4 overflow-auto p-4">
			<h2 className="text-sm font-medium text-zinc-100">{t("annotation.typeBlur")}</h2>
			<BlurControls
				value={blurRegion.blurData}
				onChange={onBlurDataChange}
				onCommit={onBlurDataCommit}
			/>
			<button
				type="button"
				onClick={onDelete}
				className="mt-2 flex h-8 items-center justify-center gap-2 rounded border border-red-400/20 text-xs text-red-400 hover:bg-red-400/10"
			>
				<Trash2 size={14} />
				{t("annotation.deleteAnnotation")}
			</button>
		</div>
	);
}
