import { z } from "zod";

/**
 * The JSON shapes we ask language models for. They double as JSON Schema for engines that can
 * constrain decoding (Ollama), which makes small local models far more reliable.
 */

const notesShape = {
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  examQuestions: z.array(z.object({ question: z.string(), answer: z.string() })),
  examHints: z.array(z.string()),
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })),
};

const sectionsShape = {
  sections: z.array(z.object({ title: z.string(), summary: z.string(), start: z.string() })),
};

const glossaryShape = {
  glossary: z.array(z.object({ term: z.string(), turkish: z.string() })),
};

/** Full notes. `sections` only when the transcript has timestamps; `glossary` only on request. */
export function notesJsonSchema(opts: { glossary: boolean; sections: boolean }) {
  const schema = z.object({
    ...notesShape,
    ...(opts.sections ? sectionsShape : {}),
    ...(opts.glossary ? glossaryShape : {}),
  });
  return toJsonSchema(schema);
}

/** One chunk of a long lecture, summarized before the final merge. */
export const digestSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  examHints: z.array(z.string()),
});

export function digestJsonSchema() {
  return toJsonSchema(digestSchema);
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function hintsJsonSchema() {
  return toJsonSchema(z.object({ examHints: z.array(z.string()) }));
}
