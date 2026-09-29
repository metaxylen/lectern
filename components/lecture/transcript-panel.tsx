import { Loader2, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { AudioControls, formatBytes } from "@/components/lecture/audio-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { formatDate } from "@/lib/format";
import { findSegmentIndex, formatTimestamp } from "@/lib/segments";
import { cn } from "@/lib/utils";

export function TranscriptPanel({ session }: { session: LectureSession }) {
  const { current, recorder, preview, pending, partsProgress, player, audioInfo, busy } = session;
  const transcript = current?.transcript ?? "";
  const segments = current?.segments ?? [];
  const showPreview = recorder.recording && (preview.finalText || preview.interim);
  const activeIndex = player.playing ? findSegmentIndex(segments, player.currentTime) : -1;
  const canSeek = player.ready && !!current?.hasAudio;
  const transcribing = (pending > 0 || partsProgress) && !recorder.recording;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Transcript
          {(pending > 0 || partsProgress) && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {partsProgress
                ? `Transcribing part ${Math.min(partsProgress.done + 1, partsProgress.total)} of ${partsProgress.total}…`
                : `Transcribing ${pending} chunk${pending > 1 ? "s" : ""}…`}
            </span>
          )}
          {transcribing && (
            <Button size="xs" variant="ghost" className="ml-auto" onClick={session.cancel}>
              <X /> Cancel
            </Button>
          )}
        </CardTitle>
        {current && (
          <CardDescription>
            {current.sttEngine} · {formatDate(current.createdAt)}
            {audioInfo ? ` · audio on this device: ${formatBytes(audioInfo.bytes)}` : ""}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AudioControls session={session} />

        {segments.length > 0 || transcript || showPreview ? (
          <div className="max-h-72 overflow-y-auto text-sm leading-relaxed">
            {segments.length > 0 ? (
              <ol className="flex flex-col gap-1" aria-label="Transcript segments">
                {segments.map((seg, i) => (
                  <li
                    key={`${seg.start}-${i}`}
                    className={cn(
                      "flex gap-2 rounded-md px-1.5 py-0.5",
                      i === activeIndex && "bg-primary/10",
                    )}
                  >
                    {canSeek ? (
                      <button
                        type="button"
                        onClick={() => player.seek(seg.start)}
                        aria-label={`Play from ${formatTimestamp(seg.start)}`}
                        className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {formatTimestamp(seg.start)}
                      </button>
                    ) : (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {formatTimestamp(seg.start)}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap">
                      {seg.text}
                      {seg.language === "tr" && (
                        <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase">
                          tr
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              transcript
            )}
            {showPreview && (
              <span className="block text-muted-foreground italic">
                {preview.finalText} {preview.interim}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {current?.hasAudio && !recorder.recording
              ? "Nothing has been transcribed yet. The audio is saved on this device."
              : recorder.recording
                ? `Listening… the first Whisper text appears after ${recorder.chunkSeconds} seconds${preview.supported ? ", with a faster live preview in grey italics" : ""}.`
                : "Press Record to start, or upload a lecture recording. Everything is transcribed locally with Whisper, in the language spoken (never translated)."}
          </p>
        )}

        {showPreview && (
          <p className="text-xs text-muted-foreground">
            Grey italics is the browser&apos;s live preview (Web Speech API, one language only:
            en-US unless you pick another). Whisper replaces it as each chunk finishes.
          </p>
        )}

        {current?.hasAudio && !recorder.recording && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {audioInfo && audioInfo.incomplete > 0 && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={session.retryFailed}>
                <RotateCcw /> Retry {audioInfo.incomplete} untranscribed part
                {audioInfo.incomplete > 1 ? "s" : ""}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={session.retranscribe}>
              <RefreshCw /> Re-transcribe with current settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={busy}
              onClick={session.deleteAudio}
            >
              <Trash2 /> Delete audio
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
