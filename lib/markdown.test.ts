import { describe, expect, it } from "vitest";
import { lectureToMarkdown, notesToMarkdown, slugify } from "./markdown";
import type { Lecture, Notes } from "./types";

const notes: Notes = {
  title: "Threads",
  summary: "Threads share memory.",
  keyPoints: ["Shared heap", "Own stack"],
  definitions: [{ term: "Thread", definition: "A unit of execution" }],
  examQuestions: [
    { question: "What is a thread?", answer: "A unit of execution" },
    { question: "No answer here", answer: "" },
  ],
  glossary: [{ term: "thread", turkish: "iş parçacığı" }],
};

describe("notesToMarkdown", () => {
  it("renders every section in English", () => {
    const md = notesToMarkdown(notes, "en", "hello world");
    expect(md).toContain("# Threads");
    expect(md).toContain("## Summary");
    expect(md).toContain("- Shared heap");
    expect(md).toContain("- **Thread**: A unit of execution");
    expect(md).toContain("## Glossary (EN–TR)");
    expect(md).toContain("- **thread** — iş parçacığı");
    expect(md).toContain("1. **What is a thread?**");
    expect(md).toContain("   - Answer: A unit of execution");
    expect(md).toContain("## Transcript\n\nhello world");
  });

  it("localizes headings and falls back to English for unknown languages", () => {
    expect(notesToMarkdown(notes, "tr")).toContain("## Özet");
    expect(notesToMarkdown(notes, "zz")).toContain("## Summary");
  });

  it("omits optional sections when empty", () => {
    const md = notesToMarkdown({ ...notes, glossary: undefined }, "en");
    expect(md).not.toContain("Glossary");
    expect(md).not.toContain("## Transcript");
  });

  it("skips the answer line for questions without an answer", () => {
    const md = notesToMarkdown(notes, "en");
    expect(md).toContain("2. **No answer here**\n");
    expect(md).not.toMatch(/No answer here\*\*\n\s+- Answer: \n/);
  });
});

describe("lectureToMarkdown", () => {
  const base: Lecture = {
    id: "1",
    createdAt: 0,
    title: "My lecture",
    transcript: "raw text",
    notes: null,
    notesLanguage: "en",
    audioLanguage: "auto",
    sttEngine: "test",
    notesEngine: null,
  };

  it("falls back to title + transcript when there are no notes", () => {
    expect(lectureToMarkdown(base)).toBe("# My lecture\n\nraw text\n");
  });

  it("uses notes when present", () => {
    expect(lectureToMarkdown({ ...base, notes })).toContain("## Key Points");
  });
});

describe("slugify", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["Çalışma Öğrenci Şüphe Ğ İ", "calisma-ogrenci-suphe-g-i"],
    ["  --weird__name!!  ", "weird-name"],
    ["", "lecture"],
    ["!!!", "lecture"],
  ])("slugifies %j to %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("truncates to 60 characters", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
});

describe("lectureToMarkdown with segments", () => {
  const lecture: Lecture = {
    id: "1",
    createdAt: 0,
    title: "Timed",
    transcript: "one two",
    notes: null,
    notesLanguage: "en",
    audioLanguage: "auto",
    sttEngine: "test",
    notesEngine: null,
    segments: [
      { start: 0, end: 20, text: "one" },
      { start: 75, end: 95, text: "two" },
    ],
  };

  it("exports timestamped lines", () => {
    expect(lectureToMarkdown(lecture)).toBe("# Timed\n\n[0:00] one\n[1:15] two\n");
  });

  it("includes timestamps in the transcript section next to notes", () => {
    expect(lectureToMarkdown({ ...lecture, notes })).toContain(
      "## Transcript\n\n[0:00] one\n[1:15] two",
    );
  });
});

describe("notesToMarkdown: new sections", () => {
  const rich = {
    ...notes,
    examHints: ["Midterm: memorize race condition."],
    sections: [
      { title: "Races", summary: "About races.", start: 75 },
      { title: "Untimed", summary: "" },
    ],
    flashcards: [{ front: "Mutex?", back: "A lock" }],
  };
  it("renders exam hints, chapters with timestamps and flashcards", () => {
    const md = notesToMarkdown(rich, "en");
    expect(md).toContain("## Exam & homework notes\n\n- Midterm: memorize race condition.");
    expect(md).toContain("- **[1:15]** **Races**: About races.");
    expect(md).toContain("- **Untimed**\n");
    expect(md).toContain("## Flashcards\n\n- **Mutex?** — A lock");
  });
  it("localizes the headings", () => {
    expect(notesToMarkdown(rich, "tr")).toContain("## Sınav ve ödev notları");
    expect(notesToMarkdown(rich, "tr")).toContain("## Bölümler");
  });
  it("omits them when absent", () => {
    const md = notesToMarkdown(notes, "en");
    expect(md).not.toContain("Flashcards");
    expect(md).not.toContain("Chapters");
    expect(md).not.toContain("Exam & homework");
  });
});
