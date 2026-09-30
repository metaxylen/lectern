import { formatTimestamp, segmentsToTimestampedText } from "./segments";
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
    hints: "Sınav ve ödev notları",
    chapters: "Bölümler",
    flashcards: "Kartlar",
  },
  en: {
    summary: "Summary",
    keyPoints: "Key Points",
    definitions: "Definitions",
    exam: "Likely Exam Questions",
    answer: "Answer",
    transcript: "Transcript",
    glossary: "Glossary (EN–TR)",
    hints: "Exam & homework notes",
    chapters: "Chapters",
    flashcards: "Flashcards",
  },
  de: {
    summary: "Zusammenfassung",
    keyPoints: "Kernpunkte",
    definitions: "Definitionen",
    exam: "Mögliche Prüfungsfragen",
    answer: "Antwort",
    transcript: "Transkript",
    glossary: "Sözlük (EN–TR)",
    hints: "Prüfungs- und Hausaufgabenhinweise",
    chapters: "Kapitel",
    flashcards: "Karteikarten",
  },
  fr: {
    summary: "Résumé",
    keyPoints: "Points clés",
    definitions: "Définitions",
    exam: "Questions d'examen probables",
    answer: "Réponse",
    transcript: "Transcription",
    glossary: "Glossary (EN–TR)",
    hints: "Examens et devoirs",
    chapters: "Chapitres",
    flashcards: "Cartes mémoire",
  },
  es: {
    summary: "Resumen",
    keyPoints: "Puntos clave",
    definitions: "Definiciones",
    exam: "Posibles preguntas de examen",
    answer: "Respuesta",
    transcript: "Transcripción",
    glossary: "Glossary (EN–TR)",
    hints: "Examen y tareas",
    chapters: "Capítulos",
    flashcards: "Tarjetas",
  },
  ar: {
    summary: "الملخص",
    keyPoints: "النقاط الرئيسية",
    definitions: "التعريفات",
    exam: "أسئلة الامتحان المحتملة",
    answer: "الإجابة",
    transcript: "النص الكامل",
    glossary: "Glossary (EN–TR)",
    hints: "ملاحظات الامتحان والواجبات",
    chapters: "الفصول",
    flashcards: "بطاقات",
  },
  ru: {
    summary: "Краткое содержание",
    keyPoints: "Ключевые моменты",
    definitions: "Определения",
    exam: "Вероятные вопросы к экзамену",
    answer: "Ответ",
    transcript: "Расшифровка",
    glossary: "Glossary (EN–TR)",
    hints: "Экзамен и домашние задания",
    chapters: "Главы",
    flashcards: "Карточки",
  },
};

export function notesToMarkdown(notes: Notes, language: string, transcript?: string): string {
  const h = HEADINGS[language] ?? HEADINGS.en;
  const out: string[] = [`# ${notes.title}`, ""];
  out.push(`## ${h.summary}`, "", notes.summary, "");
  if (notes.examHints?.length) {
    out.push(`## ${h.hints}`, "", ...notes.examHints.map((x) => `- ${x}`), "");
  }
  if (notes.sections?.length) {
    out.push(
      `## ${h.chapters}`,
      "",
      ...notes.sections.map(
        (c) =>
          `- ${c.start !== undefined ? `**[${formatTimestamp(c.start)}]** ` : ""}**${c.title}**${c.summary ? `: ${c.summary}` : ""}`,
      ),
      "",
    );
  }
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
  if (notes.flashcards?.length) {
    out.push(
      `## ${h.flashcards}`,
      "",
      ...notes.flashcards.map((c) => `- **${c.front}** — ${c.back}`),
      "",
    );
  }
  if (transcript?.trim()) {
    out.push(`## ${h.transcript}`, "", transcript.trim(), "");
  }
  return out.join("\n");
}

export function lectureToMarkdown(l: Lecture): string {
  // Keep timestamps in the export when we have them; otherwise fall back to the plain text.
  const transcript = l.segments?.length ? segmentsToTimestampedText(l.segments) : l.transcript;
  if (l.notes) return notesToMarkdown(l.notes, l.notesLanguage, transcript);
  return `# ${l.title}\n\n${transcript}\n`;
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
