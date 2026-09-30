"use client";

import { CaptureActions } from "@/components/lecture/capture-actions";
import { CaptureStatus } from "@/components/lecture/capture-status";
import { SessionOptions } from "@/components/lecture/session-options";
import { SourceTiles } from "@/components/lecture/source-tiles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LectureSession } from "@/hooks/use-lecture-session";

const HINTS_MAX = 800;

/** Everything needed to start a session, top to bottom: source, context, options, then go. */
export function CaptureCard({ session }: { session: LectureSession }) {
  const { recorder } = session;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New session</CardTitle>
        <CardDescription>
          Record a lecture or call, or upload a file. Speech is transcribed on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-labelledby="source-heading">
          <h3
            id="source-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            1 · Source
          </h3>
          <SourceTiles session={session} />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="context-heading">
          <h3
            id="context-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            2 · Context <span className="font-normal tracking-normal normal-case">(optional)</span>
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

        <section className="flex flex-col gap-2" aria-labelledby="options-heading">
          <h3
            id="options-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            3 · Options
          </h3>
          <SessionOptions session={session} />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="go-heading">
          <h3
            id="go-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            4 · Start
          </h3>
          <CaptureActions session={session} />
          <CaptureStatus session={session} />
        </section>
      </CardContent>
    </Card>
  );
}
