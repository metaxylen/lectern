import { RotateCcw, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { LectureSession } from "@/hooks/use-lecture-session";

/** Problems and progress that belong next to the record button: source errors, model download, notices. */
export function CaptureStatus({ session }: { session: LectureSession }) {
  const { recorder, whisper, preview, notice } = session;
  return (
    <>
      {recorder.error && (
        <Alert variant="destructive">
          <AlertTitle>Audio source problem</AlertTitle>
          <AlertDescription>{recorder.error}</AlertDescription>
        </Alert>
      )}
      {whisper.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Whisper model could not load</AlertTitle>
          <AlertDescription>
            {whisper.error}. The first run needs internet once to download the model; after that it
            is cached.
            {preview.supported
              ? " The live Web Speech preview will be used as a fallback transcript."
              : ""}
          </AlertDescription>
          <Button size="sm" variant="outline" className="mt-2" onClick={whisper.retry}>
            <RotateCcw /> Retry download
          </Button>
        </Alert>
      )}
      {whisper.status === "loading" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Downloading Whisper model (cached in your browser afterwards)…</span>
            <span>{whisper.progress}%</span>
          </div>
          <Progress value={whisper.progress} />
          <Button size="xs" variant="ghost" className="self-start" onClick={whisper.cancel}>
            <X /> Cancel download
          </Button>
        </div>
      )}
      {whisper.notice && <p className="text-xs text-muted-foreground">{whisper.notice}</p>}
      {!session.persistenceOk && (
        <Alert>
          <AlertDescription>
            This browser cannot store audio locally, so this recording will not survive a crash or
            reload. Keep this tab open until the notes are ready.
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
