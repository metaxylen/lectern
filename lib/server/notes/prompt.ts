import { languageName } from "../../languages";

export type PromptOptions = {
  /** The transcript text (with `[m:ss]` markers when `timed`). */
  transcript: string;
  language: string;
  glossary: boolean;
  /** Optional course/topic hints from the student: names, terms, spellings. */
  context?: string;
  /** The transcript carries `[m:ss]` markers that sections may cite. */
  timed: boolean;
  /** Established Turkish equivalents of technical terms found in the lecture. */
  terms?: { en: string; tr: string }[];
};

function languageRules(language: string): string {
  const lang = languageName(language);
  if (language === "tr") {
    return [
      "Write ALL notes in natural, fluent Turkish (not word-for-word translation).",
      'Keep technical terms in English in parentheses on first mention, e.g. "iş parçacığı (thread)".',
    ].join("\n- ");
  }
  if (language === "en") {
    return "Write ALL notes in clear English. Keep technical terms exactly as spoken.";
  }
  return `Write ALL notes in ${lang}. Keep technical terms in English as spoken.`;
}

function termsBlock(terms?: { en: string; tr: string }[]): string {
  if (!terms?.length) return "";
  return `
Established Turkish terms. Whenever you write a Turkish equivalent of one of these English terms, use EXACTLY this wording (do not invent literal translations):
${terms.map((t) => `- ${t.en} = ${t.tr}`).join("\n")}
`;
}

function contextBlock(context?: string): string {
  const c = context?.trim();
  if (!c) return "";
  return `
Student's hints about this lecture (course, topic, important names and spellings). Trust these over the transcript when a word looks misheard:
"""
${c.slice(0, 800)}
"""
`;
}

const ABOUT_TRANSCRIPT = `About the transcript:
- It is automatic speech recognition output of a university lecture. The lecturer speaks mostly English (about 90%) and sometimes switches to Turkish (about 10%) for explanations, asides and exam hints.
- It contains recognition errors: misheard technical terms, names, and words spelled in the wrong language. When the intended word is obvious from context or from the hints, silently use the correct word, and spell each technical term the same way everywhere.
- Turkish passages often carry the most valuable remarks (what will be on the exam, what to memorize). Never drop them. Keep their meaning; quote a short Turkish phrase verbatim only when it is itself the point.`;

const QUALITY_RULES = `Quality rules:
- Faithfulness first: use ONLY what the lecturer said. Never add outside facts, examples or definitions. If something is unclear, leave it out rather than guess.
- Be concrete: keep numbers, names, formulas, conditions and examples the lecturer gave. Avoid vague filler like "the lecturer discusses" or "it is important to understand".
- Every item must stand alone: a student reading only that line must understand it without the rest.
- Do not repeat the same idea in different items.`;

/** Full notes from one pass over a (short enough) transcript. */
export function buildNotesPrompt(o: PromptOptions): string {
  const sections = o.timed
    ? `,
  "sections": [{"title": string, "summary": string (1-2 sentences), "start": string (the [m:ss] marker, copied exactly, where this part begins)}] (3-8 chapters in lecture order)`
    : "";
  const glossary = o.glossary
    ? `,
  "glossary": [{"term": string (English, as used in the lecture), "turkish": string (accurate Turkish equivalent)}] (6-14 key technical terms)`
    : "";
  return `You are an expert teaching assistant. You turn a university lecture transcript into excellent study notes.

${ABOUT_TRANSCRIPT}
${contextBlock(o.context)}${termsBlock(o.terms)}
${QUALITY_RULES}
- ${languageRules(o.language)}

What each field must contain:
- "title": a specific title naming the lecture topic (not "Lecture notes").
- "summary": 3-5 sentences: what the lecture covered, the main line of argument, and the conclusion.
- "keyPoints": 6-12 self-contained statements in lecture order, each with a concrete fact, rule or relationship.
- "definitions": only terms the lecturer explicitly defined or explained; 1-2 sentence definition in the lecturer's framing. Empty array if none.
- "examQuestions": 5-8 likely exam questions that mix kinds (recall, explain why, compare, apply to a small case). Each answer is short and must be derivable from the transcript.
- "examHints": every remark about exams, quizzes, homework, deadlines or what to memorize, including Turkish cues like "vizede çıkacak", "sınavda çıkar", "ezberleyin", "bu önemli" and English ones like "remember this". Each item must be a complete, self-contained instruction that names WHAT is flagged and WHEN/WHY, written in the notes language (translate Turkish remarks), e.g. "Midterm: memorize the definition of race condition." or "Homework 3 is due next Friday (producer-consumer queue with semaphores)." Never output a bare phrase such as "bu önemli". Empty array if there were none.
- "flashcards": 8-15 atomic cards ("front" is a question or term, "back" a short answer) covering the most testable facts.

Return ONLY a JSON object with exactly this shape:
{
  "title": string,
  "summary": string,
  "keyPoints": string[],
  "definitions": [{"term": string, "definition": string}],
  "examQuestions": [{"question": string, "answer": string}],
  "examHints": string[],
  "flashcards": [{"front": string, "back": string}]${sections}${glossary}
}

TRANSCRIPT:
"""
${o.transcript}
"""`;
}

/** Map step for long lectures: digest ONE part of the lecture. */
export function buildSectionPrompt(o: PromptOptions & { index: number; total: number }): string {
  return `You are an expert teaching assistant. This is part ${o.index} of ${o.total} of a long university lecture transcript. Summarize ONLY this part; a later step will merge all parts.

${ABOUT_TRANSCRIPT}
${contextBlock(o.context)}${termsBlock(o.terms)}
${QUALITY_RULES}
- ${languageRules(o.language)}

Return ONLY a JSON object with exactly this shape:
{
  "title": string (what this part is about, specific),
  "summary": string (2-4 sentences),
  "keyPoints": string[] (3-8 concrete, self-contained statements in order),
  "definitions": [{"term": string, "definition": string}] (only terms explicitly defined here),
  "examHints": string[] (complete, self-contained instructions about exams, homework, deadlines or what to memorize, in the notes language, naming exactly what was flagged, e.g. "Midterm: memorize the definition of race condition."; never a bare "bu önemli"; empty if none)
}

PART ${o.index} OF ${o.total}:
"""
${o.transcript}
"""`;
}

/** Reduce step: merge the digests of all parts into the final notes. */
export function buildReducePrompt(o: {
  digests: string;
  language: string;
  glossary: boolean;
  context?: string;
  terms?: { en: string; tr: string }[];
}): string {
  const glossary = o.glossary
    ? `,
  "glossary": [{"term": string (English), "turkish": string (accurate Turkish equivalent)}] (8-16 key technical terms)`
    : "";
  return `You are an expert teaching assistant. A long lecture was summarized part by part. Merge the part summaries below into ONE set of excellent study notes for the whole lecture.

${contextBlock(o.context)}${termsBlock(o.terms)}
${QUALITY_RULES}
- ${languageRules(o.language)}
- Use only information present in the part summaries. Merge duplicates; keep the lecture order; keep every exam hint.

What each field must contain:
- "title": a specific title for the whole lecture.
- "summary": 4-6 sentences covering the whole lecture: scope, main line of argument, conclusion.
- "keyPoints": 8-14 of the most important, self-contained statements across all parts.
- "definitions": the important defined terms (merge duplicates), 1-2 sentence definitions.
- "examQuestions": 6-10 likely exam questions mixing recall, explain why, compare and apply; short answers derived from the summaries.
- "examHints": all exam/homework/deadline/memorize remarks from every part, deduplicated.
- "flashcards": 10-20 atomic cards ("front" question or term, "back" short answer).

Return ONLY a JSON object with exactly this shape:
{
  "title": string,
  "summary": string,
  "keyPoints": string[],
  "definitions": [{"term": string, "definition": string}],
  "examQuestions": [{"question": string, "answer": string}],
  "examHints": string[],
  "flashcards": [{"front": string, "back": string}]${glossary}
}

PART SUMMARIES (JSON):
${o.digests}`;
}

/** Ask the model to fix its own invalid output once. */
export function buildRepairPrompt(
  originalPrompt: string,
  badOutput: string,
  problem: string,
): string {
  return `${originalPrompt}

---
Your previous answer was rejected: ${problem}
Previous answer (may be truncated):
${badOutput.slice(0, 6000)}

Answer again. Return ONLY the complete, valid JSON object in the required shape, with every required field filled in.`;
}

/** Dedicated pass that turns candidate excerpts into clean exam/homework hints. */
export function buildHintsPrompt(o: {
  excerpts: string[];
  language: string;
  context?: string;
}): string {
  return `You help a student find out what the lecturer said about assessment. Below are excerpts from a university lecture transcript (English with some Turkish). The lecturer may have said that something will be on the exam, quiz or midterm, set homework or a deadline, or told students to memorize or pay attention to something.
${contextBlock(o.context)}
For each excerpt that really contains such a remark, write ONE complete, self-contained instruction for the student, naming exactly WHAT is flagged and for WHICH assessment, e.g. "Midterm: memorize the definition of race condition." or "Homework 3 is due next Friday (producer-consumer queue with semaphores)." Skip excerpts that do not contain such a remark. Use only what the excerpt says; never invent details.
- ${languageRules(o.language)}
- Write every hint in ${languageName(o.language)}: if the lecturer spoke Turkish, TRANSLATE the remark into ${languageName(o.language)}.

Return ONLY a JSON object: {"examHints": string[]} (empty array if none).

EXCERPTS:
${o.excerpts.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
}
