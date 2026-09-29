import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_LANGUAGE,
  DEFAULT_SPEECH_LANGUAGE,
  NOTES_OPTIONS,
  SPEECH_OPTIONS,
  languageName,
  parseNotesLanguage,
} from "./languages";

describe("parseNotesLanguage", () => {
  it("maps the glossary option to English + glossary", () => {
    expect(parseNotesLanguage("en-glossary")).toEqual({ language: "en", glossary: true });
  });
  it("passes plain codes through without glossary", () => {
    expect(parseNotesLanguage("tr")).toEqual({ language: "tr", glossary: false });
  });
});

describe("languageName", () => {
  it("returns the English name", () => {
    expect(languageName("de")).toBe("German");
  });
  it("falls back to Turkish for unknown codes (legacy behaviour)", () => {
    expect(languageName("xx")).toBe("Turkish");
  });
});

describe("option lists", () => {
  it("defaults exist in their option lists", () => {
    expect(SPEECH_OPTIONS.map((o) => o.value)).toContain(DEFAULT_SPEECH_LANGUAGE);
    expect(NOTES_OPTIONS.map((o) => o.value)).toContain(DEFAULT_NOTES_LANGUAGE);
  });
  it("has no duplicate values", () => {
    for (const list of [SPEECH_OPTIONS, NOTES_OPTIONS]) {
      const values = list.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
