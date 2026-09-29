import { z } from "zod";

export const NotesSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  examQuestions: z.array(z.object({ question: z.string(), answer: z.string() })),
  glossary: z.array(z.object({ term: z.string(), turkish: z.string() })).optional(),
});

export const LectureSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number(),
  title: z.string(),
  transcript: z.string(),
  notes: NotesSchema.nullable(),
  notesLanguage: z.string(),
  notesGlossary: z.boolean().optional(),
  audioLanguage: z.string(),
  sttEngine: z.string(),
  notesEngine: z.enum(["ollama", "gemini", "offline"]).nullable(),
  durationSec: z.number().optional(),
});

/** Keep every well-formed lecture from untrusted storage and drop the rest. */
export function parseLectures(raw: unknown) {
  if (!Array.isArray(raw)) return { lectures: [], dropped: 0 };
  const lectures = raw.flatMap((item) => {
    const r = LectureSchema.safeParse(item);
    return r.success ? [r.data] : [];
  });
  return { lectures, dropped: raw.length - lectures.length };
}
