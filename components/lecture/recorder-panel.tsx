import { useRef } from "react";
import { FileAudio, Mic, RotateCcw, Square, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { mmss } from "@/lib/format";

export function RecorderPanel({ session }: { session: LectureSession }) {
  const { recorder, whisper, preview, busy, notice } = session;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {recorder.recording ? (
            <Button
              size="lg"
              variant="destructive"
              className="h-11 px-5"
              onClick={session.stopRecording}
            >
              <Square className="fill-current" /> Stop &amp; make notes
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-11 px-5"
              onClick={session.startRecording}
              disabled={busy}
            >
              <Mic /> Record
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="h-11 px-5"
            disabled={recorder.recording || busy}
            onClick={() => fileInput.current?.click()}
          >
            <FileAudio /> Upload audio
          </Button>
          <input
            ref={fileInput}
            type="file"
            aria-label="Upload audio file"
            accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.flac"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              await session.uploadFile(file);
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
          {recorder.recording && (
            <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-red-500" />
              </span>
              <span className="font-mono tabular-nums">{mmss(recorder.elapsed)}</span>
              <span className="text-muted-foreground">· chunks every {recorder.chunkSeconds}s</span>
            </div>
          )}
        </div>

        {recorder.error && (
          <Alert variant="destructive">
            <AlertTitle>Microphone problem</AlertTitle>
            <AlertDescription>{recorder.error}</AlertDescription>
          </Alert>
        )}
        {whisper.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Whisper model could not load</AlertTitle>
            <AlertDescription>
              {whisper.error}. The first run needs internet once to download the model; after that
              it is cached.
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
      </CardContent>
    </Card>
  );
}
