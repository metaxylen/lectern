// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SessionPreferencesModule from "./session-preferences";

let preferences: typeof SessionPreferencesModule;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  preferences = await import("./session-preferences");
});

describe("session preferences", () => {
  it("saves changes without losing other choices and restores them on a fresh load", async () => {
    preferences.saveSessionPreference("audioLang", "en");
    preferences.saveSessionPreference("notesLang", "tr");
    preferences.saveSessionPreference("modelId", "onnx-community/whisper-base");
    preferences.saveSessionPreference("engineChoice", "openai");
    preferences.saveSessionPreference("liveEnabled", false);

    vi.resetModules();
    const reloaded = await import("./session-preferences");
    expect(reloaded.readSessionPreferences()).toEqual({
      audioLang: "en",
      notesLang: "tr",
      modelId: "onnx-community/whisper-base",
      engineChoice: "openai",
      liveEnabled: false,
    });
  });

  it("replaces invalid fields with defaults while keeping valid choices", () => {
    localStorage.setItem(
      preferences.SESSION_PREFERENCES_KEY,
      JSON.stringify({
        audioLang: "invalid-language",
        notesLang: "fr",
        modelId: "removed-model",
        engineChoice: "unknown-engine",
        liveEnabled: false,
      }),
    );

    expect(preferences.readSessionPreferences()).toEqual({
      audioLang: "auto",
      notesLang: "fr",
      modelId: "whisper.cpp/large-v3-turbo",
      engineChoice: "auto",
      liveEnabled: false,
    });
  });

  it.each(["{not json", "null", "[]", '"invalid"'])(
    "uses defaults when stored preferences are malformed: %s",
    (stored) => {
      localStorage.setItem(preferences.SESSION_PREFERENCES_KEY, stored);
      expect(preferences.readSessionPreferences()).toEqual(preferences.DEFAULT_SESSION_PREFERENCES);
    },
  );

  it("does not overwrite saved choices just by reading them", () => {
    const stored = JSON.stringify({ notesLang: "de" });
    localStorage.setItem(preferences.SESSION_PREFERENCES_KEY, stored);
    expect(preferences.readSessionPreferences().notesLang).toBe("de");
    expect(localStorage.getItem(preferences.SESSION_PREFERENCES_KEY)).toBe(stored);
  });

  it("keeps choices in memory and reports a failed write when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(preferences.saveSessionPreference("notesLang", "tr")).toBe(false);
    expect(preferences.readSessionPreferences().notesLang).toBe("tr");
  });

  it("uses defaults when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(preferences.readSessionPreferences()).toEqual(preferences.DEFAULT_SESSION_PREFERENCES);
  });
});
