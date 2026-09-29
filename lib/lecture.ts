import { formatDate } from "./format";
import { parseNotesLanguage } from "./languages";
import type { Lecture } from "./types";

export function newLecture(
  audioLanguage: string,
  notesLanguage: string,
  sttEngine: string,
): Lecture {
  const now = Date.now();
  const notes = parseNotesLanguage(notesLanguage);
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    title: `Lecture ${formatDate(now)}`,
    transcript: "",
    notes: null,
    notesLanguage: notes.language,
    notesGlossary: notes.glossary,
    audioLanguage,
    sttEngine,
    notesEngine: null,
  };
}
