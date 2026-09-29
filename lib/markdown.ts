import type { Lecture, Notes } from "./types";

const HEADINGS: Record<string, Record<string, string>> = {
  tr: {
    summary: "Özet",
    keyPoints: "Ana Noktalar",
    definitions: "Tanımlar",
    exam: "Olası Sınav Soruları",
    answer: "Cevap",
    transcript: "Transkript",
    glossary: "Sözlük (EN–TR)",
  },
  en: {
    summary: "Summary",
    keyPoints: "Key Points",
    definitions: "Definitions",
    exam: "Likely Exam Questions",
    answer: "Answer",
    transcript: "Transcript",
    glossary: "Glossary (EN–TR)",
  },
  de: {
    summary: "Zusammenfassung",
    keyPoints: "Kernpunkte",
    definitions: "Definitionen",
    exam: "Mögliche Prüfungsfragen",
    answer: "Antwort",
    transcript: "Transkript",
    glossary: "Sözlük (EN–TR)",
  },
  fr: {
    summary: "Résumé",
    keyPoints: "Points clés",
    definitions: "Définitions",
    exam: "Questions d'examen probables",
    answer: "Réponse",
    transcript: "Transcription",
    glossary: "Glossary (EN–TR)",
  },
  es: {
    summary: "Resumen",
    keyPoints: "Puntos clave",
    definitions: "Definiciones",
    exam: "Posibles preguntas de examen",
    answer: "Respuesta",
    transcript: "Transcripción",
    glossary: "Glossary (EN–TR)",
  },
  ar: {
    summary: "الملخص",
    keyPoints: "النقاط الرئيسية",
    definitions: "التعريفات",
    exam: "أسئلة الامتحان المحتملة",
    answer: "الإجابة",
    transcript: "النص الكامل",
    glossary: "Glossary (EN–TR)",
  },
  ru: {
    summary: "Краткое содержание",
    keyPoints: "Ключевые моменты",
    definitions: "Определения",
    exam: "Вероятные вопросы к экзамену",
    answer: "Ответ",
    transcript: "Расшифровка",
    glossary: "Glossary (EN–TR)",
  },
};

export function notesToMarkdown(notes: Notes, language: string, transcript?: string): string {
  const h = HEADINGS[language] ?? HEADINGS.en;
  const out: string[] = [`# ${notes.title}`, ""];
  out.push(`## ${h.summary}`, "", notes.summary, "");
  out.push(`## ${h.keyPoints}`, "", ...notes.keyPoints.map((p) => `- ${p}`), "");
  out.push(
    `## ${h.definitions}`,
    "",
    ...notes.definitions.map((d) => `- **${d.term}**: ${d.definition}`),
    "",
  );
  if (notes.glossary?.length) {
    out.push(
      `## ${h.glossary}`,
      "",
      ...notes.glossary.map((g) => `- **${g.term}** — ${g.turkish}`),
      "",
    );
  }
  out.push(`## ${h.exam}`, "");
  notes.examQuestions.forEach((q, i) => {
    out.push(`${i + 1}. **${q.question}**`);
    if (q.answer) out.push(`   - ${h.answer}: ${q.answer}`);
  });
  out.push("");
  if (transcript?.trim()) {
    out.push(`## ${h.transcript}`, "", transcript.trim(), "");
  }
  return out.join("\n");
}

export function lectureToMarkdown(l: Lecture): string {
  if (l.notes) return notesToMarkdown(l.notes, l.notesLanguage, l.transcript);
  return `# ${l.title}\n\n${l.transcript}\n`;
}

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return (
    s
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c])
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lecture"
  );
}
