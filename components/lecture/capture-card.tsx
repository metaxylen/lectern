"use client";

import { CaptureActions } from "@/components/lecture/capture-actions";
import { CaptureStatus } from "@/components/lecture/capture-status";
import { SessionOptions } from "@/components/lecture/session-options";
import { SourceTiles } from "@/components/lecture/source-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LectureSession } from "@/hooks/use-lecture-session";

const HINTS_MAX = 800;

/** Capture deck: source, optional context, options, then record or upload. */
export function CaptureCard({ session }: { session: LectureSession }) {
  const { recorder } = session;
  return (
    <Card>
      <CardHeader className="border-b border-white/8 pb-4">
        <CardTitle className="flex flex-col items-start gap-2 text-base sm:flex-row sm:flex-wrap sm:items-center">
          New session
          <Badge variant="secondary" className="font-normal sm:ml-auto">
            Local-first · audio stays on this device
          </Badge>
        </CardTitle>
        <CardDescription>
          Record a lecture or call, or upload a file. Speech is transcribed on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <section className="flex flex-col gap-2" aria-labelledby="source-heading">
          <h3
            id="source-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Source
          </h3>
          <SourceTiles session={session} />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="context-heading">
          <h3
            id="context-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Context <span className="font-normal tracking-normal normal-case">(optional)</span>
          </h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes-context" className="font-normal">
              Course or topic hints (optional)
            </Label>
            <Textarea
              id="notes-context"
              rows={2}
              maxLength={HINTS_MAX}
              value={session.context}
              onChange={(e) => session.setContext(e.target.value)}
              disabled={recorder.recording}
              placeholder="e.g. Operating Systems, week 6: synchronization. Terms: mutex, semaphore, Dijkstra."
            />
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <span>Names and terms here fix misheard words and keep the notes consistent.</span>
              <span className="tabular-nums">
                {session.context.length}/{HINTS_MAX}
              </span>
            </div>
          </div>
        </section>

        <SessionOptions session={session} />
        <CaptureActions session={session} />
        <CaptureStatus session={session} />
      </CardContent>
    </Card>
  );
}
