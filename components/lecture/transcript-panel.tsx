import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { formatDate } from "@/lib/format";

export function TranscriptPanel({ session }: { session: LectureSession }) {
  const { current, recorder, preview, pending, partsProgress } = session;
  const transcript = current?.transcript ?? "";
  const showPreview = recorder.recording && (preview.finalText || preview.interim);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Transcript
          {(pending > 0 || partsProgress) && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {partsProgress
                ? `Transcribing part ${Math.min(partsProgress.done + 1, partsProgress.total)} of ${partsProgress.total}…`
                : `Transcribing ${pending} chunk${pending > 1 ? "s" : ""}…`}
            </span>
          )}
        </CardTitle>
        {current && (
          <CardDescription>
            {current.sttEngine} · {formatDate(current.createdAt)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {transcript || showPreview ? (
          <div className="max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
            {transcript}
            {showPreview && (
              <span className="text-muted-foreground italic">
                {transcript ? " " : ""}
                {preview.finalText} {preview.interim}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {recorder.recording
              ? `Listening… the first Whisper text appears after ${recorder.chunkSeconds} seconds${preview.supported ? ", with a faster live preview in grey italics" : ""}.`
              : "Press Record to start, or upload a lecture recording. Everything is transcribed locally with Whisper, in the language spoken (never translated)."}
          </p>
        )}
        {showPreview && (
          <p className="mt-2 text-xs text-muted-foreground">
            Grey italics is the browser&apos;s live preview (Web Speech API, one language only:
            en-US unless you pick another). Whisper replaces it as each chunk finishes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
