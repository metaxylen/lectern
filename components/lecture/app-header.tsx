import Image from "next/image";
import { EngineStrip } from "@/components/lecture/engine-strip";
import { Badge } from "@/components/ui/badge";
import type { LectureSession } from "@/hooks/use-lecture-session";

export function AppHeader({ session }: { session: LectureSession }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Image src="/logo.svg" alt="" width={40} height={40} priority className="rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lectern</h1>
          <p className="text-sm text-muted-foreground">
            Lecture transcription and study notes that stay on your machine.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          Local-first · your audio stays on this device
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
