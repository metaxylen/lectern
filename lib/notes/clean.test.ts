import { describe, expect, it } from "vitest";
import {
  cleanSegments,
  cleanText,
  collapsePhraseLoops,
  collapseWordRepeats,
  isHallucination,
} from "./clean";

const seg = (start: number, text: string) => ({ start, end: start + 20, text });

describe("isHallucination", () => {
  it.each([
    "Thank you.",
    "Thanks for watching!",
    "Thank you so much for listening.",
    "Please subscribe to my channel",
    "Subtitles by the Amara.org community",
    "Altyazı M.K.",
    "İzlediğiniz için teşekkürler",
    "[Music]",
    "[müzik]",
  ])("flags %j", (t) => expect(isHallucination(t)).toBe(true));

  it.each([
    "Thank you for the question, let me explain threads.",
    "The thread scheduler picks the next job.",
    "Teşekkürler, şimdi bellek yönetimine geçelim.",
  ])("keeps real speech %j", (t) => expect(isHallucination(t)).toBe(false));
});

describe("collapseWordRepeats", () => {
  it("collapses runs of 3+ identical words", () => {
    expect(collapseWordRepeats("the the the cat").text).toBe("the cat");
    expect(collapseWordRepeats("so, so, so, so it works").text).toBe("so it works");
  });
  it("leaves legitimate doubles alone", () => {
    expect(collapseWordRepeats("that that is fine").text).toBe("that that is fine");
    expect(collapseWordRepeats("I had had enough").text).toBe("I had had enough");
  });
});

describe("collapsePhraseLoops", () => {
  it("collapses a repeated phrase", () => {
    const r = collapsePhraseLoops("we will see we will see we will see the result");
    expect(r.text).toBe("we will see the result");
    expect(r.collapsed).toBeGreaterThan(0);
  });
  it("leaves non-repeating text alone", () => {
    const t = "a thread is a unit of execution";
    expect(collapsePhraseLoops(t).text).toBe(t);
  });
});

describe("cleanText", () => {
  it("removes fillers and tidies spacing", () => {
    const r = cleanText("So um the thread uh shares memory , right?");
    expect(r.text).toBe("So the thread shares memory, right?");
    expect(r.stats.removedFillers).toBe(2);
  });
  it("returns empty for stock hallucinations", () => {
    expect(cleanText("Thank you.").text).toBe("");
  });
  it("does not damage Turkish text", () => {
    const t = "Bellek, verinin saklandığı alandır.";
    expect(cleanText(t).text).toBe(t);
  });
});

describe("cleanSegments", () => {
  it("drops hallucinations and immediate duplicates but keeps timestamps", () => {
    const { segments, stats } = cleanSegments([
      seg(0, "A thread is a unit of execution."),
      seg(20, "A thread is a unit of execution."),
      seg(40, "Thank you."),
      seg(60, "Threads share the heap."),
    ]);
    expect(segments.map((s) => [s.start, s.text])).toEqual([
      [0, "A thread is a unit of execution."],
      [60, "Threads share the heap."],
    ]);
    expect(stats.removedSegments).toBe(2);
  });

  it("only removes consecutive duplicates, not legitimate repetition later", () => {
    const { segments } = cleanSegments([
      seg(0, "Remember this."),
      seg(20, "Something else entirely."),
      seg(40, "Remember this."),
    ]);
    expect(segments).toHaveLength(3);
  });

  it("does not mutate its input", () => {
    const input = [seg(0, "um hello there friend")];
    cleanSegments(input);
    expect(input[0].text).toBe("um hello there friend");
  });
});
