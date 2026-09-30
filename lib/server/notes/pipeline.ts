import { dominantLanguage, extractiveNotes } from "../../extractive";
import { chunkSegments, renderWithTimestamps, type TranscriptChunk } from "../../notes/chunk";
import { groundNotes } from "../../notes/ground";
import { findHintCandidates, mergeHints } from "../../notes/hints";
import { prepareTranscriptClient } from "../../notes/prepare";
import { applyKnownGlossary, findKnownTerms } from "../../notes/terms";
import { digestJsonSchema, hintsJsonSchema, notesJsonSchema } from "../../notes/schema";
import type { Notes, Section, Segment } from "../../types";
import type { LlmClient } from "./llm";
import { dedupeStrings, normalizeNotes, parseJson } from "./normalize";
import {
  buildNotesPrompt,
  buildReducePrompt,
  buildHintsPrompt,
  buildRepairPrompt,
  buildSectionPrompt,
} from "./prompt";

export type NotesInput = {
  transcript: string;
  /** Timestamped segments. When present they enable chapters with jump-to-audio timestamps. */
  segments?: Segment[];
  language: string;
  glossary: boolean;
  /** Student's hints: course, topic, spellings. */
  context?: string;
};

export type ProgressEvent = { message: string; done?: number; total?: number };

export type PipelineOptions = {
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
};

export type PipelineResult = { notes: Notes; warnings: string[]; parts: number };

type Digest = {
  title: string;
  summary: string;
  keyPoints: string[];
  definitions: { term: string; definition: string }[];
  examHints: string[];
};

/** Clean the transcript and decide whether it has usable timestamps. */
export function prepareTranscript(input: Pick<NotesInput, "transcript" | "segments">) {
  return prepareTranscriptClient(input.transcript, input.segments);
}

/**
 * Ask for JSON, validate it, and if it is unusable show the model its own mistake and ask once
 * more. Small local models fail often enough that this single retry matters.
 */
async function askForJson<T>(
  client: LlmClient,
  prompt: string,
  schema: Record<string, unknown>,
  validate: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  const raw = await client.generateJson(prompt, { schema, signal });
  try {
    return validate(parseJson(raw));
  } catch (first) {
    const problem = first instanceof Error ? first.message : String(first);
    const retryRaw = await client.generateJson(buildRepairPrompt(prompt, raw, problem), {
      schema,
      signal,
    });
    try {
      return validate(parseJson(retryRaw));
    } catch (second) {
      const again = second instanceof Error ? second.message : String(second);
      throw new Error(`${again} (after one repair attempt)`);
    }
  }
}

function validateDigest(raw: unknown): Digest {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => String(v ?? "").trim();
  const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const digest: Digest = {
    title: str(o.title),
    summary: str(o.summary),
    keyPoints: dedupeStrings(strings(o.keyPoints)),
    definitions: (Array.isArray(o.definitions) ? o.definitions : [])
      .map((d) => ({
        term: str((d as Record<string, unknown>)?.term),
        definition: str((d as Record<string, unknown>)?.definition),
      }))
      .filter((d) => d.term && d.definition),
    examHints: dedupeStrings(strings(o.examHints)),
  };
  if (!digest.summary || !digest.keyPoints.length) throw new Error("Part summary was incomplete");
  return digest;
}

/** Last resort for one part: build a digest from the offline summarizer so nothing is silently lost. */
function fallbackDigest(chunk: TranscriptChunk): Digest {
  const n = extractiveNotes(chunk.text);
  return {
    title: n.title,
    summary: n.summary,
    keyPoints: n.keyPoints.slice(0, 5),
    definitions: n.definitions,
    examHints: n.examHints ?? [],
  };
}

/** Shrink digests until their JSON fits `budget` characters, dropping detail but never exam hints. */
export function compactDigests(digests: Digest[], budget: number): string {
  for (const keep of [8, 5, 3, 2, 1, 0]) {
    const compact = digests.map((d) => ({
      title: d.title,
      summary: d.summary,
      keyPoints: d.keyPoints.slice(0, keep),
      definitions: d.definitions.slice(0, Math.max(keep, 1)),
      examHints: d.examHints,
    }));
    const json = JSON.stringify(compact);
    if (json.length <= budget || keep === 0) return json;
  }
  return "[]";
}

/** Snap model-cited chapter starts to real segment starts; drop chapters it made up. */
export function fixSections(
  sections: Section[] | undefined,
  segments: Segment[],
): Section[] | undefined {
  if (!sections?.length) return undefined;
  const starts = segments.map((s) => s.start).filter(Number.isFinite);
  if (!starts.length) return sections.map(({ title, summary }) => ({ title, summary }));
  const last = Math.max(...starts);
  const snapped = sections.map((s) => {
    if (s.start === undefined || s.start > last + 30) return { title: s.title, summary: s.summary };
    const at = [...starts].reverse().find((t) => t <= s.start!) ?? starts[0];
    return { title: s.title, summary: s.summary, start: at };
  });
  const seen = new Set<number>();
  const unique = snapped.filter((s) => {
    if (s.start === undefined) return true;
    if (seen.has(s.start)) return false;
    seen.add(s.start);
    return true;
  });
  return unique.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
}

/**
 * A dedicated, small pass for "what will be on the exam". Models often skip these remarks when
 * they also have to write everything else, but they handle them reliably when it is the only task.
 */
export async function extractExamHints(
  client: LlmClient,
  segments: Segment[],
  o: { language: string; context?: string; signal?: AbortSignal },
): Promise<string[] | null> {
  const candidates = findHintCandidates(segments);
  // No assessment wording anywhere: there is nothing to report, and anything the main pass
  // "found" would be invented.
  if (!candidates.length) return [];
  try {
    const prompt = buildHintsPrompt({
      excerpts: candidates.map((c) => c.text),
      language: o.language,
      context: o.context,
    });
    const raw = await client.generateJson(prompt, { schema: hintsJsonSchema(), signal: o.signal });
    const parsed = parseJson(raw) as { examHints?: unknown };
    const list = Array.isArray(parsed.examHints) ? parsed.examHints : [];
    return list.map((h) => String(h ?? "").trim()).filter(Boolean);
  } catch (err) {
    if (o.signal?.aborted) throw err;
    return null; // A bonus pass: never fail the whole job because of it.
  }
}

function languageWarning(notes: Notes, language: string): string | null {
  const sample = `${notes.summary} ${notes.keyPoints.slice(0, 3).join(" ")}`;
  if (sample.length < 120) return null;
  const detected = dominantLanguage(sample);
  if (language === "tr" && detected !== "tr")
    return "The notes may not be written in Turkish as requested.";
  if (language === "en" && detected === "tr")
    return "The notes may not be written in English as requested.";
  return null;
}

function finish(notes: Notes, plain: string, input: NotesInput, segments: Segment[]) {
  const warnings: string[] = [];
  const sections = fixSections(notes.sections, segments);
  const base: Notes = { ...notes };
  if (sections?.length) base.sections = sections;
  else delete base.sections;
  const grounded = groundNotes(applyKnownGlossary(base), plain, { language: input.language });
  warnings.push(...grounded.warnings);
  if (grounded.notes.examQuestions.length < 3)
    warnings.push("Fewer than 3 exam questions were produced.");
  const lang = languageWarning(grounded.notes, input.language);
  if (lang) warnings.push(lang);
  return { notes: grounded.notes, warnings };
}

export async function runLlmPipeline(
  client: LlmClient,
  input: NotesInput,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const { onProgress, signal } = opts;
  const { segments, plain, timed } = prepareTranscript(input);
  // Established Turkish wording for technical terms that appear, so the model does not invent it.
  const terms = input.language === "tr" || input.glossary ? findKnownTerms(plain) : [];
  const common = {
    language: input.language,
    glossary: input.glossary,
    context: input.context,
    terms,
  };
  const fullSchema = notesJsonSchema({ glossary: input.glossary, sections: timed });

  // --- short lecture: one pass ---------------------------------------------------------------
  if (plain.length <= client.singlePassChars) {
    onProgress?.({ message: "Writing notes" });
    const transcript = timed ? renderWithTimestamps(segments) : plain;
    const prompt = buildNotesPrompt({ ...common, transcript, timed });
    const notes = await askForJson(client, prompt, fullSchema, normalizeNotes, signal);
    onProgress?.({ message: "Checking exam remarks" });
    const extra = await extractExamHints(client, segments, {
      language: input.language,
      context: input.context,
      signal,
    });
    // The dedicated pass is the source of truth; the main pass's own hints are only a fallback
    // when that pass failed, because models invent hints when asked for them among other tasks.
    notes.examHints = mergeHints(extra ?? notes.examHints ?? []).slice(0, 12);
    if (!notes.examHints.length) delete notes.examHints;
    return { ...finish(notes, plain, input, segments), parts: 1 };
  }

  // --- long lecture: summarize parts, then merge ---------------------------------------------
  const chunks = chunkSegments(segments, client.sectionChars);
  const warnings: string[] = [];
  const digests: Digest[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Cancelled");
    onProgress?.({
      message: `Reading part ${i + 1} of ${chunks.length}`,
      done: i,
      total: chunks.length,
    });
    const prompt = buildSectionPrompt({
      ...common,
      transcript: chunks[i].text,
      timed: false,
      index: i + 1,
      total: chunks.length,
    });
    try {
      digests.push(await askForJson(client, prompt, digestJsonSchema(), validateDigest, signal));
    } catch (err) {
      if (signal?.aborted) throw err;
      digests.push(fallbackDigest(chunks[i]));
      warnings.push(
        `Part ${i + 1} could not be summarized by the model; a simpler summary was used.`,
      );
    }
  }

  onProgress?.({ message: "Merging into final notes", done: chunks.length, total: chunks.length });
  const reducePrompt = buildReducePrompt({
    ...common,
    digests: compactDigests(digests, client.singlePassChars),
  });
  const merged = await askForJson(
    client,
    reducePrompt,
    notesJsonSchema({ glossary: input.glossary, sections: false }),
    normalizeNotes,
    signal,
  );

  // Chapters come from the parts themselves, so their timestamps are exact by construction.
  merged.sections = digests.map((d, i) => ({
    title: d.title || `Part ${i + 1}`,
    summary: d.summary,
    ...(chunks[i].start !== undefined ? { start: Math.floor(chunks[i].start!) } : {}),
  }));
  // A dedicated pass over the lecturer's actual assessment remarks is the source of truth; the
  // model's own hints (from the parts and the merge) are only a fallback if that pass failed.
  onProgress?.({ message: "Checking exam remarks" });
  const extra = await extractExamHints(client, segments, {
    language: input.language,
    context: input.context,
    signal,
  });
  merged.examHints = mergeHints(
    extra ?? [...(merged.examHints ?? []), ...digests.flatMap((d) => d.examHints)],
  ).slice(0, 12);
  if (!merged.examHints.length) delete merged.examHints;

  const done = finish(merged, plain, input, segments);
  return { notes: done.notes, warnings: [...warnings, ...done.warnings], parts: chunks.length };
}
