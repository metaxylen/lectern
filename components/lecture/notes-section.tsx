import { Copy, Download, Loader2, RefreshCw, Sparkles, TriangleAlert, X } from "lucide-react";
import { NotesView } from "@/components/notes-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LectureSession } from "@/hooks/use-lecture-session";
import type { NotesEngine } from "@/lib/types";

function engineLabel(engine: NotesEngine, model?: string) {
  if (engine === "offline") return "Offline summarizer";
  return `${engine === "ollama" ? "Ollama" : "Gemini"}${model ? ` · ${model}` : ""}`;
}

export function NotesSection({ session }: { session: LectureSession }) {
  const { current, notesMeta, generating, busy, recorder, notesProgress, player } = session;
  const transcript = current?.transcript ?? "";

  return (
    <>
      {generating && (
        <Card>
          <CardContent
            className="flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" />
            {notesProgress ?? "Writing your notes"}…
            <Button size="xs" variant="ghost" className="ml-auto" onClick={session.cancelNotes}>
              <X /> Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {current && transcript && !recorder.recording && (
        <section className="flex flex-col gap-4" aria-label="Notes">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={session.copyMarkdown} variant="outline" disabled={!current.notes}>
              <Copy /> Copy Markdown
            </Button>
            <Button onClick={session.downloadMarkdown} variant="outline">
              <Download /> Download .md
            </Button>
            <Button
              onClick={() => session.generateNotes(current)}
              variant="secondary"
              disabled={busy}
            >
              {current.notes ? <RefreshCw /> : <Sparkles />}
              {current.notes ? "Regenerate notes" : "Generate notes"}
            </Button>
            {notesMeta && (
              <Badge variant="outline" className="ml-auto">
                {engineLabel(notesMeta.engine, notesMeta.model)}
              </Badge>
            )}
          </div>
          {notesMeta && notesMeta.fallbackReasons.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Fell back to{" "}
              {notesMeta.engine === "offline" ? "the offline summarizer" : notesMeta.engine}:{" "}
              {notesMeta.fallbackReasons.join(" · ")}
            </p>
          )}
          {notesMeta?.warnings && notesMeta.warnings.length > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                <ul className="list-disc pl-4" aria-label="Notes quality warnings">
                  {notesMeta.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {notesMeta?.engine === "offline" &&
            (current.notesLanguage !== "en" || current.notesGlossary) && (
              <Alert>
                <AlertDescription>
                  The offline summarizer selects sentences from the transcript as spoken, so it
                  cannot translate or build a Turkish glossary. Use Ollama or Gemini for that.
                </AlertDescription>
              </Alert>
            )}
          {current.notes && (
            <NotesView
              notes={current.notes}
              language={current.notesLanguage}
              title={current.title}
              onSeek={current.hasAudio && player.ready ? (t) => player.seek(t) : undefined}
            />
          )}
        </section>
      )}
    </>
  );
}
