import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("embeds the transcript and requests JSON", () => {
    const p = buildPrompt("hello there", "en", false);
    expect(p).toContain('"""\nhello there\n"""');
    expect(p).toContain("Return ONLY a JSON object");
    expect(p).not.toContain('"glossary"');
  });

  it("adds the glossary shape only when requested", () => {
    expect(buildPrompt("x", "en", true)).toContain('"glossary"');
  });

  it("adapts language rules", () => {
    expect(buildPrompt("x", "tr", false)).toContain("Write the notes in Turkish");
    expect(buildPrompt("x", "de", false)).toContain("Write the notes in German");
    expect(buildPrompt("x", "en", false)).toContain("Write the notes in English");
  });
});
