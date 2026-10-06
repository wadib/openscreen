import {
	CircleHelp,
	Cpu,
	Download,
	ExternalLink,
	Keyboard,
	MonitorUp,
	PauseCircle,
	PlayCircle,
	RefreshCw,
	Scan,
	Scissors,
} from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { STUDIO_MCP_VERSION, STUDIO_TOOLS } from "@/lib/studioMcpContract";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";

const HELP_TOPICS = [
	["quickStart", PlayCircle, 5],
	["recording", MonitorUp, 6],
	["pause", PauseCircle, 4],
	["studio", Scissors, 6],
	["blur", Scan, 5],
	["export", Download, 5],
	["updates", RefreshCw, 4],
	["mcp", Cpu, 4],
	["troubleshooting", CircleHelp, 6],
] as const;

const MCP_TOOL_GROUPS = [
	["Project", ["studio_status", "studio_open_project", "studio_history", "studio_save_copy"]],
	[
		"Edit",
		[
			"studio_set_zoom",
			"studio_add_trim",
			"studio_add_speed",
			"studio_remove_region",
			"studio_set_microphone",
			"studio_set_layout",
		],
	],
	["Output", ["studio_preview", "studio_snapshot", "studio_export", "studio_cancel_export"]],
] as const;

export function SettingsHelp({
	onOpenShortcuts,
	updatesEnabled,
}: {
	onOpenShortcuts: () => void;
	updatesEnabled: boolean;
}) {
	const t = useScopedT("launch");
	const variables = { version: STUDIO_MCP_VERSION, count: STUDIO_TOOLS.length };
	const openIssues = () =>
		void window.electronAPI.openExternalUrl("https://github.com/wadib/openscreen/issues");

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-auto px-5 py-4">
				<h1 className="text-base font-semibold text-zinc-100">{t("help.title")}</h1>
				<p className="mt-1 text-xs leading-5 text-zinc-400">{t("help.guide.intro")}</p>
				<Accordion
					type="multiple"
					defaultValue={["quickStart"]}
					className="mt-3 border-t border-white/10"
				>
					{HELP_TOPICS.filter(([key]) => key !== "updates" || updatesEnabled).map(
						([key, Icon, stepCount]) => (
							<AccordionItem key={key} value={key} className="border-white/10">
								<AccordionTrigger className="gap-3 py-3 text-left text-zinc-100">
									<span className="flex min-w-0 items-center gap-2.5">
										<Icon className="h-4 w-4 shrink-0 text-[#34B27B]" aria-hidden="true" />
										<span>{t(`help.guide.${key}.title`)}</span>
									</span>
								</AccordionTrigger>
								<AccordionContent className="pl-6 pr-1">
									<p className="text-xs leading-5 text-zinc-400">
										{t(`help.guide.${key}.intro`, variables)}
									</p>
									<ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-zinc-300">
										{Array.from({ length: stepCount }, (_, index) => (
											<li key={`${key}-${index + 1}`}>
												{t(`help.guide.${key}.step${index + 1}`, variables)}
											</li>
										))}
									</ol>
									{key === "mcp" && (
										<div className="mt-3 space-y-2 border-t border-white/10 pt-3">
											{MCP_TOOL_GROUPS.map(([label, tools]) => (
												<div
													key={label}
													className="grid grid-cols-[52px_1fr] gap-2 text-xs leading-5"
												>
													<strong className="font-medium text-zinc-400">{label}</strong>
													<code className="break-words text-[11px] text-zinc-300">
														{tools.join(", ")}
													</code>
												</div>
											))}
										</div>
									)}
								</AccordionContent>
							</AccordionItem>
						),
					)}
				</Accordion>
			</div>
			<footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
				<Button type="button" variant="outline" size="sm" onClick={onOpenShortcuts}>
					<Keyboard size={14} aria-hidden="true" />
					{t("help.openShortcuts")}
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={openIssues}>
					{t("help.reportIssue")}
					<ExternalLink size={14} aria-hidden="true" />
				</Button>
			</footer>
		</div>
	);
}
