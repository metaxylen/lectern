"use client";

import { useState } from "react";
import {
  BookOpen,
  CalendarClock,
  Download,
  HelpCircle,
  Languages,
  Layers,
  ListChecks,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { flashcardsToAnkiTsv } from "@/lib/export/anki";
import { formatTimestamp } from "@/lib/segments";
import { slugify } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Notes } from "@/lib/types";

const L: Record<string, Record<string, string>> = {
  tr: {
    summary: "Özet",
    key: "Ana noktalar",
    defs: "Tanımlar",
    exam: "Olası sınav soruları",
    glossary: "Sözlük (EN–TR)",
    answer: "Cevap",
    none: "Bu derste açık bir tanım bulunamadı.",
    hints: "Sınav ve ödev notları",
    chapters: "Bölümler",
    flashcards: "Çalışma kartları",
    flip: "Cevabı görmek için karta tıkla",
    anki: "Anki için indir",
  },
  en: {
    summary: "Summary",
    key: "Key points",
    defs: "Definitions",
    exam: "Likely exam questions",
    glossary: "Glossary (EN–TR)",
    answer: "Answer",
    none: "No explicit definitions found.",
    hints: "Exam & homework notes",
    chapters: "Chapters",
    flashcards: "Flashcards",
    flip: "Click a card to see the answer",
    anki: "Download for Anki",
  },
};

function Flashcard({ front, back }: { front: string; back: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      aria-pressed={shown}
      className={cn(
        "flex min-h-24 flex-col justify-between rounded-lg border p-3 text-left text-sm transition-colors",
        shown ? "border-primary/30 bg-primary/5" : "bg-card hover:bg-muted",
      )}
    >
      <span className={cn("font-medium", shown && "text-xs text-muted-foreground")}>{front}</span>
      {shown && <span className="mt-1.5 leading-relaxed">{back}</span>}
    </button>
  );
}

export function NotesView({
  notes,
  language,
  title,
  onSeek,
}: {
  notes: Notes;
  language: string;
  /** Used for the Anki file name. */
  title?: string;
  /** When audio is available, chapter timestamps jump to that moment. */
  onSeek?: (seconds: number) => void;
}) {
  const t = L[language] ?? L.en;
  const downloadAnki = () => {
    const tsv = flashcardsToAnkiTsv(notes.flashcards ?? []);
    const url = URL.createObjectURL(
      new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(title ?? notes.title)}-anki.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight text-balance">{notes.title}</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4" /> {t.summary}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed whitespace-pre-line">
          {notes.summary}
        </CardContent>
      </Card>

      {notes.examHints && notes.examHints.length > 0 && (
        <Card size="sm" className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> {t.hints}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-amber-600"
              aria-label={t.hints}
            >
              {notes.examHints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {notes.sections && notes.sections.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4" /> {t.chapters}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm" aria-label={t.chapters}>
              {notes.sections.map((c, i) => (
                <li key={i} className="flex gap-3">
                  {c.start !== undefined &&
                    (onSeek ? (
                      <button
                        type="button"
                        onClick={() => onSeek(c.start!)}
                        aria-label={`Play from ${formatTimestamp(c.start)}`}
                        className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {formatTimestamp(c.start)}
                      </button>
                    ) : (
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {formatTimestamp(c.start)}
                      </span>
                    ))}
                  <div>
                    <p className="font-medium">{c.title}</p>
                    {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-4" /> {t.key}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
            {notes.keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Quote className="size-4" /> {t.defs}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notes.definitions.length ? (
            <dl className="space-y-3 text-sm">
              {notes.definitions.map((d, i) => (
                <div key={i}>
                  <dt className="font-medium">{d.term}</dt>
                  <dd className="text-muted-foreground">{d.definition}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t.none}</p>
          )}
        </CardContent>
      </Card>

      {notes.glossary && notes.glossary.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="size-4" /> {t.glossary}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {notes.glossary.map((g, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-dashed py-1">
                  <dt className="font-medium">{g.term}</dt>
                  <dd className="text-right text-muted-foreground">{g.turkish}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="size-4" /> {t.exam}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {notes.examQuestions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">
                  {i + 1}
                </Badge>
                <div>
                  <p className="font-medium">{q.question}</p>
                  {q.answer && (
                    <p className="mt-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground/70">{t.answer}: </span>
                      {q.answer}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {notes.flashcards && notes.flashcards.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4" /> {t.flashcards}
              <Button size="xs" variant="outline" className="ml-auto" onClick={downloadAnki}>
                <Download /> {t.anki}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{t.flip}</p>
            <div className="grid gap-2 sm:grid-cols-2" aria-label={t.flashcards}>
              {notes.flashcards.map((c, i) => (
                <Flashcard key={i} front={c.front} back={c.back} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
