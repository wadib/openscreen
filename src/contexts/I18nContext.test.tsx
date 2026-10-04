import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { I18nProvider, useI18n } from "./I18nContext";

const setLocale = vi.fn();
beforeEach(() => {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	vi.stubGlobal("electronAPI", { setLocale });
});
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
it("updates an existing renderer when Settings saves a new language", () => {
	const { result } = renderHook(useI18n, { wrapper: I18nProvider });
	act(() =>
		window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_STORAGE_KEY, newValue: "es" })),
	);
	expect(result.current.locale).toBe("es");
	expect(document.documentElement.lang).toBe("es");
	expect(setLocale).toHaveBeenLastCalledWith("es");
});
it("ignores unsupported language values from another renderer", () => {
	const { result } = renderHook(useI18n, { wrapper: I18nProvider });
	act(() =>
		window.dispatchEvent(
			new StorageEvent("storage", { key: LOCALE_STORAGE_KEY, newValue: "unsupported" }),
		),
	);
	expect(result.current.locale).toBe("en");
});
