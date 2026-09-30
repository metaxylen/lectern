import { describe, expect, it, vi } from "vitest";
import type { Segment } from "../../types";
import type { LlmClient } from "./llm";
import {
  compactDigests,
  extractExamHints,
  fixSections,
  prepareTranscript,
  runLlmPipeline,
} from "./pipeline";

const seg = (start: number, text: string): Segment => ({ start, end: start + 20, text });

const goodNotes = {
  title: "Synchronization",
  summary: "The lecture explains race conditions and mutual exclusion in threads.",
  keyPoints: ["A race condition depends on thread order.", "A mutex allows one holder."],
  definitions: [
    { term: "race condition", definition: "Result depends on thread order." },
    { term: "quantum tunnelling", definition: "Invented by the model." },
  ],
  examQuestions: [
    { question: "What is a race condition?", answer: "Order-dependent result." },
    { question: "What is a mutex?", answer: "A lock." },
    { question: "Why lock?", answer: "To avoid races." },
  ],
  examHints: ["Invented hint from the main pass that nobody said."],
  flashcards: [{ front: "mutex", back: "lock" }],
  sections: [
    { title: "Races", summary: "About races.", start: "0:25" },
    { title: "Locks", summary: "About locks.", start: "1:00" },
  ],
};

const SEGMENTS = [
  seg(0, "A race condition happens when the result depends on the order of the threads."),
  seg(20, "A mutex is a lock that only one thread can hold at a time."),
  seg(40, "Bu konu vizede mutlaka çıkacak, race condition tanımını ezberleyin."),
  seg(60, "Thank you."),
];

type Call = { prompt: string; schema?: Record<string, unknown> };

function fakeClient(
  responder: (prompt: string, call: number) => string | Promise<string>,
  over: Partial<LlmClient> = {},
) {
  const calls: Call[] = [];
  const client: LlmClient = {
    engine: "ollama",
    model: "fake",
    singlePassChars: 10_000,
    sectionChars: 200,
    async generateJson(prompt, opts) {
      calls.push({ prompt, schema: opts?.schema });
      return responder(prompt, calls.length);
    },
    ...over,
  };
  return { client, calls };
}

const isHintsPrompt = (p: string) => p.includes("EXCERPTS:");
const hintsReply = JSON.stringify({
  examHints: ["Midterm: memorize the definition of race condition."],
});

const input = { transcript: "x", segments: SEGMENTS, language: "en", glossary: false };

describe("prepareTranscript", () => {
  it("cleans hallucinations and detects timestamps", () => {
    const p = prepareTranscript({ transcript: "", segments: SEGMENTS });
    expect(p.timed).toBe(true);
    expect(p.plain).not.toContain("Thank you");
    expect(p.segments).toHaveLength(3);
  });
  it("falls back to plain text without timestamps", () => {
    const p = prepareTranscript({
      transcript: "A thread is a unit of execution. Threads share the heap of a process.",
    });
    expect(p.timed).toBe(false);
  });
});

describe("runLlmPipeline: single pass", () => {
  it("returns validated, grounded notes with snapped chapters and sourced exam hints", async () => {
    const { client, calls } = fakeClient((p) =>
      isHintsPrompt(p) ? hintsReply : JSON.stringify(goodNotes),
    );
    const progress: string[] = [];
    const r = await runLlmPipeline(client, input, { onProgress: (e) => progress.push(e.message) });

    expect(r.parts).toBe(1);
    expect(calls).toHaveLength(2); // notes + dedicated exam-hint pass
    // The hallucinated definition is removed and reported.
    expect(r.notes.definitions.map((d) => d.term)).toEqual(["race condition"]);
    expect(r.warnings.join(" ")).toMatch(/1 definition removed/);
    // Hints come from the dedicated pass, not from the main pass's invention.
    expect(r.notes.examHints).toEqual(["Midterm: memorize the definition of race condition."]);
    // Chapter starts are snapped to real segment starts.
    expect(r.notes.sections?.map((s) => s.start)).toEqual([20, 40]);
    expect(progress).toEqual(["Writing notes", "Checking exam remarks"]);
  });

  it("sends timestamps to the model and uses a JSON schema", async () => {
    const { client, calls } = fakeClient((p) =>
      isHintsPrompt(p) ? hintsReply : JSON.stringify(goodNotes),
    );
    await runLlmPipeline(client, input);
    expect(calls[0].prompt).toContain("[0:00] A race condition");
    expect(calls[0].prompt).not.toContain("Thank you");
    expect(calls[0].schema).toBeTruthy();
  });

  it("repairs invalid output with one retry that shows the model its mistake", async () => {
    let n = 0;
    const { client, calls } = fakeClient((p) => {
      if (isHintsPrompt(p)) return hintsReply;
      return n++ === 0 ? '{"title":"only a title"}' : JSON.stringify(goodNotes);
    });
    const r = await runLlmPipeline(client, input);
    expect(r.notes.title).toBe("Synchronization");
    const repair = calls.find((c) => c.prompt.includes("Your previous answer was rejected"));
    expect(repair?.prompt).toContain("incomplete notes JSON");
  });

  it("gives up after a single repair attempt", async () => {
    const { client, calls } = fakeClient(() => "not json at all");
    await expect(runLlmPipeline(client, input)).rejects.toThrow(/after one repair attempt/);
    expect(calls).toHaveLength(2);
  });

  it("keeps the model's own hints only if the dedicated pass failed", async () => {
    const { client } = fakeClient((p) => {
      if (isHintsPrompt(p)) throw new Error("hint pass exploded");
      return JSON.stringify(goodNotes);
    });
    const r = await runLlmPipeline(client, input);
    expect(r.notes.examHints).toEqual(["Invented hint from the main pass that nobody said."]);
  });

  it("reports no exam hints when the lecturer never mentioned assessment", async () => {
    const quiet = [seg(0, "A race condition depends on thread order in the program.")];
    const { client, calls } = fakeClient(() => JSON.stringify(goodNotes));
    const r = await runLlmPipeline(client, { ...input, segments: quiet, transcript: "x" });
    expect(calls).toHaveLength(1); // no hint pass at all
    expect(r.notes.examHints).toBeUndefined();
  });

  it("drops chapters' timestamps for untimed transcripts", async () => {
    const { client } = fakeClient(() => JSON.stringify({ ...goodNotes, sections: undefined }));
    const r = await runLlmPipeline(client, {
      transcript: "A race condition depends on the order of the threads in a program.",
      language: "en",
      glossary: false,
    });
    expect(r.notes.sections).toBeUndefined();
  });

  it("injects established Turkish terms for Turkish notes", async () => {
    const { client, calls } = fakeClient((p) =>
      isHintsPrompt(p) ? hintsReply : JSON.stringify(goodNotes),
    );
    await runLlmPipeline(client, { ...input, language: "tr" });
    expect(calls[0].prompt).toContain("- race condition = yarış durumu");
    expect(calls[0].prompt).toContain("- mutex = muteks");
  });

  it("corrects invented Turkish glossary wording", async () => {
    const withGlossary = {
      ...goodNotes,
      glossary: [{ term: "race condition", turkish: "yüzleşme koşulu" }],
    };
    const { client } = fakeClient((p) =>
      isHintsPrompt(p) ? hintsReply : JSON.stringify(withGlossary),
    );
    const r = await runLlmPipeline(client, { ...input, glossary: true });
    expect(r.notes.glossary).toEqual([{ term: "race condition", turkish: "yarış durumu" }]);
  });

  it("stops promptly when aborted", async () => {
    const controller = new AbortController();
    const { client } = fakeClient(() => {
      controller.abort();
      throw new Error("aborted");
    });
    await expect(runLlmPipeline(client, input, { signal: controller.signal })).rejects.toThrow();
  });
});

describe("runLlmPipeline: long lecture (part by part)", () => {
  const longSegments = Array.from({ length: 8 }, (_, i) =>
    seg(i * 20, `Part ${i} explains thread topic number ${i} in some detail for the class.`),
  );
  const digest = (n: number) => ({
    title: `Topic ${n}`,
    summary: `Summary ${n}.`,
    keyPoints: [`Point ${n}`],
    definitions: [],
    examHints: ["Model-invented hint"],
  });

  it("summarizes each part, merges, and builds exact chapters from the parts", async () => {
    let part = 0;
    const { client, calls } = fakeClient(
      (p) => {
        if (isHintsPrompt(p)) return JSON.stringify({ examHints: [] });
        if (p.includes("PART SUMMARIES"))
          return JSON.stringify({ ...goodNotes, sections: undefined });
        return JSON.stringify(digest(part++));
      },
      { singlePassChars: 100, sectionChars: 150 },
    );
    const progress: string[] = [];
    const r = await runLlmPipeline(
      client,
      { transcript: "x", segments: longSegments, language: "en", glossary: false },
      { onProgress: (e) => progress.push(e.message) },
    );
    expect(r.parts).toBeGreaterThan(1);
    expect(r.notes.sections).toHaveLength(r.parts);
    expect(r.notes.sections?.[0]).toMatchObject({ title: "Topic 0", start: 0 });
    expect(r.notes.sections?.map((s) => s.start)).toEqual(
      [...(r.notes.sections ?? [])].map((s) => s.start).sort((a, b) => a! - b!),
    );
    expect(progress.some((m) => m.startsWith("Reading part 1 of"))).toBe(true);
    expect(progress).toContain("Merging into final notes");
    // Part prompts never contain the whole lecture.
    const partPrompts = calls.filter((c) => c.prompt.includes("Summarize ONLY this part"));
    expect(
      partPrompts.every(
        (c) => !c.prompt.includes("topic number 7") || c.prompt.includes("topic number 6"),
      ),
    ).toBe(true);
    // Model-invented hints are dropped: nobody mentioned assessment.
    expect(r.notes.examHints).toBeUndefined();
  });

  it("falls back to an offline summary for a part the model cannot produce", async () => {
    let n = 0;
    const { client } = fakeClient(
      (p) => {
        if (isHintsPrompt(p)) return JSON.stringify({ examHints: [] });
        if (p.includes("PART SUMMARIES"))
          return JSON.stringify({ ...goodNotes, sections: undefined });
        // The first part fails both the attempt and its repair; later parts succeed.
        return n++ < 2 ? "garbage" : JSON.stringify(digest(n));
      },
      { singlePassChars: 100, sectionChars: 150 },
    );
    const r = await runLlmPipeline(client, {
      transcript: "x",
      segments: longSegments,
      language: "en",
      glossary: false,
    });
    expect(r.warnings.join(" ")).toMatch(/Part 1 could not be summarized/);
    expect(r.notes.sections?.length).toBe(r.parts);
  });
});

describe("compactDigests", () => {
  const big = Array.from({ length: 10 }, (_, i) => ({
    title: `T${i}`,
    summary: "s".repeat(50),
    keyPoints: Array.from({ length: 8 }, (_, k) => `point ${k} ${"x".repeat(40)}`),
    definitions: [],
    examHints: [`hint ${i}`],
  }));

  it("shrinks key points to fit the budget but always keeps hints", () => {
    const json = compactDigests(big, 2500);
    expect(json.length).toBeLessThanOrEqual(2500);
    for (let i = 0; i < 10; i++) expect(json).toContain(`hint ${i}`);
  });
  it("leaves small input untouched", () => {
    const small = compactDigests(big.slice(0, 1), 100_000);
    expect(JSON.parse(small)[0].keyPoints).toHaveLength(8);
  });
});

describe("fixSections", () => {
  const segments = [seg(0, "a"), seg(20, "b"), seg(40, "c")];
  it("snaps to the nearest earlier segment start, dedupes and sorts", () => {
    const out = fixSections(
      [
        { title: "C", summary: "", start: 45 },
        { title: "A", summary: "", start: 3 },
        { title: "A2", summary: "", start: 5 },
      ],
      segments,
    );
    expect(out?.map((s) => [s.title, s.start])).toEqual([
      ["A", 0],
      ["C", 40],
    ]);
  });
  it("drops timestamps far beyond the recording and strips them for untimed input", () => {
    expect(
      fixSections([{ title: "X", summary: "", start: 9999 }], segments)?.[0].start,
    ).toBeUndefined();
    const untimed = fixSections(
      [{ title: "X", summary: "", start: 5 }],
      [{ start: NaN, end: NaN, text: "a" }],
    );
    expect(untimed?.[0]).toEqual({ title: "X", summary: "" });
  });
  it("returns undefined when there are no sections", () => {
    expect(fixSections([], segments)).toBeUndefined();
    expect(fixSections(undefined, segments)).toBeUndefined();
  });
});

describe("extractExamHints", () => {
  it("returns [] without calling the model when there are no cue words", async () => {
    const generate = vi.fn();
    const client = { ...fakeClient(() => "").client, generateJson: generate };
    expect(
      await extractExamHints(client, [seg(0, "Threads share the heap.")], { language: "en" }),
    ).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
  it("returns null when the model fails", async () => {
    const { client } = fakeClient(() => {
      throw new Error("down");
    });
    expect(await extractExamHints(client, SEGMENTS, { language: "en" })).toBeNull();
  });
});
