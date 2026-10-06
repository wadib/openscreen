import { describe, expect, it } from "vitest";
import { type Locale, SUPPORTED_LOCALES } from "@/i18n/config";
import arCommon from "@/i18n/locales/ar/common.json";
import arLaunch from "@/i18n/locales/ar/launch.json";
import enCommon from "@/i18n/locales/en/common.json";
import enLaunch from "@/i18n/locales/en/launch.json";
import esCommon from "@/i18n/locales/es/common.json";
import esLaunch from "@/i18n/locales/es/launch.json";
import frCommon from "@/i18n/locales/fr/common.json";
import frLaunch from "@/i18n/locales/fr/launch.json";
import itCommon from "@/i18n/locales/it/common.json";
import itLaunch from "@/i18n/locales/it/launch.json";
import jaJPCommon from "@/i18n/locales/ja-JP/common.json";
import jaJPLaunch from "@/i18n/locales/ja-JP/launch.json";
import koKRCommon from "@/i18n/locales/ko-KR/common.json";
import koKRLaunch from "@/i18n/locales/ko-KR/launch.json";
import ptBRCommon from "@/i18n/locales/pt-BR/common.json";
import ptBRLaunch from "@/i18n/locales/pt-BR/launch.json";
import ruCommon from "@/i18n/locales/ru/common.json";
import ruLaunch from "@/i18n/locales/ru/launch.json";
import trCommon from "@/i18n/locales/tr/common.json";
import trLaunch from "@/i18n/locales/tr/launch.json";
import viCommon from "@/i18n/locales/vi/common.json";
import viLaunch from "@/i18n/locales/vi/launch.json";
import zhCNCommon from "@/i18n/locales/zh-CN/common.json";
import zhCNLaunch from "@/i18n/locales/zh-CN/launch.json";
import zhTWCommon from "@/i18n/locales/zh-TW/common.json";
import zhTWLaunch from "@/i18n/locales/zh-TW/launch.json";

const launchKeys = [
	"help.title",
	"help.intro",
	"help.recordingTitle",
	"help.recordingDescription",
	"help.studioTitle",
	"help.studioDescription",
	"help.exportTitle",
	"help.exportDescription",
	"help.mcpTitle",
	"help.mcpDescription",
	"help.troubleshootingTitle",
	"help.troubleshootingDescription",
	"help.openShortcuts",
	"help.reportIssue",
	"about.title",
	"about.description",
	"about.versionLabel",
	"about.loadingVersion",
	"about.systemLabel",
	"about.mcpLabel",
	"about.mcpTools",
	"about.openSource",
	"about.repository",
	"about.license",
	"about.componentsTitle",
	"about.componentsBundled",
	"about.component.studioMcp",
	"about.component.captureEngine",
	"about.component.blurry",
	"about.component.cameraControls",
	"about.checkUpdates",
	"about.checkingUpdates",
	"about.updateAvailable",
	"about.upToDate",
	"about.manifestUnavailable",
	"about.viewRelease",
	"about.updateCheckFailed",
] as const;

const resources = {
	en: { launch: enLaunch, common: enCommon },
	ar: { launch: arLaunch, common: arCommon },
	es: { launch: esLaunch, common: esCommon },
	fr: { launch: frLaunch, common: frCommon },
	it: { launch: itLaunch, common: itCommon },
	"ja-JP": { launch: jaJPLaunch, common: jaJPCommon },
	"ko-KR": { launch: koKRLaunch, common: koKRCommon },
	"pt-BR": { launch: ptBRLaunch, common: ptBRCommon },
	ru: { launch: ruLaunch, common: ruCommon },
	tr: { launch: trLaunch, common: trCommon },
	vi: { launch: viLaunch, common: viCommon },
	"zh-CN": { launch: zhCNLaunch, common: zhCNCommon },
	"zh-TW": { launch: zhTWLaunch, common: zhTWCommon },
} satisfies Record<Locale, { launch: object; common: { actions: Record<string, unknown> } }>;

function getNestedValue(root: object, path: string) {
	return path.split(".").reduce<unknown>((value, key) => {
		if (!value || typeof value !== "object") return undefined;
		return (value as Record<string, unknown>)[key];
	}, root);
}

describe("Settings Help and About translations", () => {
	it("provides complete English task guidance", () => {
		for (const [topic, count] of [
			["quickStart", 5],
			["recording", 6],
			["pause", 4],
			["studio", 6],
			["blur", 5],
			["export", 5],
			["updates", 4],
			["mcp", 4],
			["troubleshooting", 6],
		] as const) {
			for (const key of ["title", "intro"]) {
				expect(getNestedValue(enLaunch, `help.guide.${topic}.${key}`)).toEqual(expect.any(String));
			}
			for (let step = 1; step <= count; step += 1) {
				expect(getNestedValue(enLaunch, `help.guide.${topic}.step${step}`)).toEqual(
					expect.any(String),
				);
			}
		}
	});

	it("defines every new message for each supported locale", () => {
		for (const locale of SUPPORTED_LOCALES) {
			const { launch, common } = resources[locale];
			for (const key of launchKeys) {
				const message = getNestedValue(launch, key);
				expect(message, `${locale} launch.${key}`).toEqual(expect.any(String));
				expect((message as string).trim().length, `${locale} launch.${key}`).toBeGreaterThan(0);
			}
			for (const key of ["help", "openHelp"]) {
				const message = common.actions[key];
				expect(message, `${locale} common.actions.${key}`).toEqual(expect.any(String));
				expect(
					(message as string).trim().length,
					`${locale} common.actions.${key}`,
				).toBeGreaterThan(0);
			}
		}
	});
});
