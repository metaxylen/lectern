import { describe, expect, it } from "vitest";
import { parseWhisperInference } from "./parse";

describe("parseWhisperInference", () => {
  it("reads text and a language code", () => {
    expect(parseWhisperInference({ text: "  Hello.  ", language: "en" })).toEqual({
      text: "Hello.",
      language: "en",
    });
  });

  it("maps verbose_json language names", () => {
    expect(parseWhisperInference({ text: "Merhaba", language: "turkish" })).toEqual({
      text: "Merhaba",
      language: "tr",
    });
  });

  it("omits auto or missing language", () => {
    expect(parseWhisperInference({ text: "Hi", language: "auto" })).toEqual({ text: "Hi" });
    expect(parseWhisperInference({ text: "Hi" })).toEqual({ text: "Hi" });
  });

  it("surfaces server error strings", () => {
    expect(() => parseWhisperInference({ error: "failed to load model" })).toThrow(
      /failed to load model/,
    );
  });

  it("rejects empty payloads", () => {
    expect(() => parseWhisperInference(null)).toThrow(/empty response/);
  });
});
