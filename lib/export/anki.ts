import type { Flashcard } from "../types";

/** Tab-separated text that Anki's "Import File" understands: one card per line, front then back. */
export function flashcardsToAnkiTsv(cards: Flashcard[]): string {
  const clean = (s: string) => s.replace(/\t/g, " ").replace(/\r?\n/g, "<br>").trim();
  return cards
    .filter((c) => c.front.trim() && c.back.trim())
    .map((c) => `${clean(c.front)}\t${clean(c.back)}`)
    .join("\n");
}
