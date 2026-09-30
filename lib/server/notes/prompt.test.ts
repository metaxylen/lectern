import { describe, expect, it } from "vitest";
import {
  buildHintsPrompt,
  buildNotesPrompt,
  buildReducePrompt,
  buildRepairPrompt,
  buildSectionPrompt,
} from "./prompt";

const base = { transcript: "hello there", language: "en", glossary: false, timed: false };

describe("buildNotesPrompt", () => {
  it("embeds the transcript and requests JSON", () => {
    const p = buildNotesPrompt(base);
    expect(p).toContain('"""\nhello there\n"""');
    expect(p).toContain("Return ONLY a JSON object");
    expect(p).not.toContain('"glossary"');
    expect(p).not.toContain('"sections"');
  });

  it("adds glossary and sections only when asked", () => {
    expect(buildNotesPrompt({ ...base, glossary: true })).toContain('"glossary"');
    const timed = buildNotesPrompt({ ...base, timed: true });
    expect(timed).toContain('"sections"');
    expect(timed).toContain("[m:ss]");
  });

  it("adapts language rules", () => {
    expect(buildNotesPrompt({ ...base, language: "tr" })).toContain("natural, fluent Turkish");
    expect(buildNotesPrompt({ ...base, language: "de" })).toContain("Write ALL notes in German");
    expect(buildNotesPrompt(base)).toContain("Write ALL notes in clear English");
  });

  it("includes student hints and known terms only when provided", () => {
    const plain = buildNotesPrompt(base);
    expect(plain).not.toContain("Student's hints");
    expect(plain).not.toContain("Established Turkish terms");
    const rich = buildNotesPrompt({
      ...base,
      context: "OS week 6: mutex",
      terms: [{ en: "deadlock", tr: "kilitlenme" }],
    });
    expect(rich).toContain("OS week 6: mutex");
    expect(rich).toContain("- deadlock = kilitlenme");
  });

  it("caps very long hints", () => {
    const p = buildNotesPrompt({ ...base, context: "x".repeat(5000) });
    expect(p.length).toBeLessThan(9000);
  });

  it("demands faithful, self-contained exam hints", () => {
    const p = buildNotesPrompt(base);
    expect(p).toContain("Faithfulness first");
    expect(p).toContain("self-contained");
    expect(p).toContain("bu önemli");
  });
});

describe("other prompts", () => {
  it("section prompt names the part", () => {
    const p = buildSectionPrompt({ ...base, index: 2, total: 5 });
    expect(p).toContain("part 2 of 5");
    expect(p).toContain('"examHints"');
  });

  it("reduce prompt carries digests and optional glossary", () => {
    const p = buildReduceWith(true);
    expect(p).toContain('[{"title":"A"}]');
    expect(p).toContain('"glossary"');
    expect(buildReduceWith(false)).not.toContain('"glossary"');
  });

  it("repair prompt shows the problem and truncates the bad output", () => {
    const p = buildRepairPrompt("ORIGINAL", "y".repeat(10_000), "missing title");
    expect(p).toContain("ORIGINAL");
    expect(p).toContain("missing title");
    expect(p.length).toBeLessThan(7000);
  });

  it("hints prompt lists numbered excerpts and demands the notes language", () => {
    const p = buildHintsPrompt({ excerpts: ["a one", "b two"], language: "en" });
    expect(p).toContain("1. a one");
    expect(p).toContain("2. b two");
    expect(p).toContain("TRANSLATE");
  });
});

function buildReduceWith(glossary: boolean) {
  return buildReducePrompt({ digests: '[{"title":"A"}]', language: "en", glossary });
}
