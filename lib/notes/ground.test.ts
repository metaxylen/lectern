import { describe, expect, it } from "vitest";
import { groundNotes, isGrounded, normalizeForMatch } from "./ground";
import type { Notes } from "../types";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share the heap. Bellek, verinin saklandığı alandır. Semaphores protect critical sections.";

describe("normalizeForMatch", () => {
  it("lowercases, strips punctuation and Turkish diacritics", () => {
    expect(normalizeForMatch("Bellek, SAKLANDIĞI Alan!")).toBe("bellek saklandigi alan");
    expect(normalizeForMatch("İşlem")).toBe("islem");
  });
});

describe("isGrounded", () => {
  const norm = normalizeForMatch(TRANSCRIPT);
  it("matches exact phrases and inflections", () => {
    expect(isGrounded("thread", norm)).toBe(true);
    expect(isGrounded("Threads", norm)).toBe(true);
    expect(isGrounded("critical sections", norm)).toBe(true);
    expect(isGrounded("Bellek", norm)).toBe(true);
  });
  it("matches multi-word terms when most words are present", () => {
    expect(isGrounded("heap memory sharing", norm)).toBe(false);
    expect(isGrounded("unit of execution", norm)).toBe(true);
  });
  it("rejects invented terms and empties", () => {
    expect(isGrounded("quantum entanglement", norm)).toBe(false);
    expect(isGrounded("", norm)).toBe(false);
    expect(isGrounded("the of", norm)).toBe(false);
  });
});

describe("groundNotes", () => {
  const notes: Notes = {
    title: "T",
    summary: "S",
    keyPoints: ["k"],
    definitions: [
      { term: "Thread", definition: "unit of execution" },
      { term: "Quantum tunnelling", definition: "made up" },
    ],
    examQuestions: [],
    glossary: [
      { term: "heap", turkish: "yığın" },
      { term: "blockchain", turkish: "blok zinciri" },
    ],
  };

  it("drops ungrounded definitions and glossary entries with a warning", () => {
    const { notes: out, warnings } = groundNotes(notes, TRANSCRIPT);
    expect(out.definitions.map((d) => d.term)).toEqual(["Thread"]);
    expect(out.glossary?.map((g) => g.term)).toEqual(["heap"]);
    expect(warnings).toHaveLength(2);
  });

  it("keeps everything and stays quiet when all is grounded", () => {
    const ok: Notes = { ...notes, definitions: [notes.definitions[0]], glossary: undefined };
    const { notes: out, warnings } = groundNotes(ok, TRANSCRIPT);
    expect(out).toEqual(ok);
    expect(warnings).toEqual([]);
  });
});

describe("groundNotes for non-English notes", () => {
  const notes: Notes = {
    title: "T",
    summary: "S",
    keyPoints: ["k"],
    definitions: [
      { term: "yarış durumu (race condition)", definition: "x" },
      { term: "Semafor", definition: "dictionary translation of a grounded term" },
      { term: "kilitlenme", definition: "dictionary translation of deadlock" },
      { term: "Bellek yönetimi", definition: "foreign term we cannot judge: kept" },
      {
        term: "kuantum tünelleme (quantum tunnelling)",
        definition: "parenthetical is not in the transcript",
      },
    ],
    examQuestions: [],
  };
  const transcript =
    "A race condition is bad. Semaphores keep a counter. Deadlock happens when threads wait for each other.";

  it("accepts translated terms backed by the transcript and drops fabricated ones", () => {
    const { notes: out, warnings } = groundNotes(notes, transcript, { language: "tr" });
    expect(out.definitions.map((d) => d.term)).toEqual([
      "yarış durumu (race condition)",
      "Semafor",
      "kilitlenme",
      "Bellek yönetimi",
    ]);
    expect(warnings).toHaveLength(1);
  });

  it("stays strict for English notes", () => {
    const { notes: out } = groundNotes(notes, transcript, { language: "en" });
    expect(out.definitions.map((d) => d.term)).toEqual([
      "yarış durumu (race condition)",
      "Semafor",
      "kilitlenme",
    ]);
  });
});
