"use client";

import { BookOpen, HelpCircle, Languages, ListChecks, Quote } from "lucide-react";
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
  },
  en: {
    summary: "Summary",
    key: "Key points",
    defs: "Definitions",
    exam: "Likely exam questions",
    glossary: "Glossary (EN–TR)",
    answer: "Answer",
    none: "No explicit definitions found.",
  },
};

export function NotesView({ notes, language }: { notes: Notes; language: string }) {
  const t = L[language] ?? L.en;
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
    </div>
  );
}
