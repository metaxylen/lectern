import { RotateCcw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { formatDate } from "@/lib/format";

/** Offers to finish recordings that were interrupted by a crash, reload or power loss. */
export function RecoveryBanner({ session }: { session: LectureSession }) {
  if (!session.unfinished.length || session.busy || session.recorder.recording) return null;
  return (
    <Alert role="region" aria-label="Unfinished recordings">
      <RotateCcw />
      <AlertTitle>
        {session.unfinished.length === 1
          ? "An earlier recording was interrupted"
          : `${session.unfinished.length} earlier recordings were interrupted`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>The audio was saved on this device. You can transcribe it and make notes now.</p>
        <ul className="flex flex-col gap-2">
          {session.unfinished.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{s.title}</span>
              <span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" onClick={() => session.recoverSession(s.id)}>
                  Recover
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Discard ${s.title}`}
                  onClick={() => session.discardUnfinished(s.id)}
                >
                  <Trash2 /> Discard
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
