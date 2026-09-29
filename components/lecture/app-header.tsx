import { Mic } from "lucide-react";
import { EngineStrip } from "@/components/lecture/engine-strip";
import { Badge } from "@/components/ui/badge";
import type { LectureSession } from "@/hooks/use-lecture-session";

export function AppHeader({ session }: { session: LectureSession }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Mic className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">stt</h1>
          <p className="text-sm text-muted-foreground">
            Lecture note-taker: record or upload, get a transcript and study notes.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          100% free · runs on your machine
        </Badge>
      </div>
      <EngineStrip
        whisper={session.whisper}
        modelId={session.modelId}
        engines={session.engines}
        previewSupported={session.preview.supported}
      />
    </header>
  );
}
