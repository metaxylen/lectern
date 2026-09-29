import { languageName } from "../../languages";

export function buildPrompt(transcript: string, language: string, glossary: boolean): string {
  const lang = languageName(language);
  const glossaryShape = glossary
    ? `,
  "glossary": [{"term": string (English), "turkish": string (Turkish equivalent)}] (6-12 key technical terms from the lecture)`
    : "";
  const languageRules =
    language === "tr"
      ? 'Write the notes in Turkish. Keep technical terms in English in parentheses on first mention, e.g. "iş parçacığı (thread)".'
      : language === "en"
        ? "Write the notes in English. Keep technical terms as spoken."
        : `Write the notes in ${lang}. Keep technical terms in English as spoken.`;
  return `You turn a university lecture transcript into study notes for a student.

About the transcript:
- It comes from automatic speech recognition and is MIXED English and Turkish: the lecturer speaks mostly English (about 90%) and occasionally switches to Turkish (about 10%) for explanations, asides or exam hints.
- It may contain recognition errors: misheard technical terms, names, or words spelled as the wrong language. When the intended word is obvious from context, silently fix it. Never invent content that is not in the lecture.
- Do not drop the Turkish parts. They often carry important remarks (for example what will be on the exam). Keep their meaning in the notes; quote a short Turkish phrase verbatim when useful${language === "tr" ? "" : ", followed by its meaning in the notes language"}.

Output rules:
- ${languageRules}
- Return ONLY a JSON object with exactly this shape:
{
  "title": string,
  "summary": string (one short paragraph, 3-5 sentences),
  "keyPoints": string[] (5-10 concise bullet points),
  "definitions": [{"term": string, "definition": string}] (terms defined or introduced in the lecture),
  "examQuestions": [{"question": string, "answer": string}] (5-8 likely exam questions with short model answers)${glossaryShape}
}

TRANSCRIPT:
"""
${transcript}
"""`;
}
