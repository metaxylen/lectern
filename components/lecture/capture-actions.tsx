"use client";

import { useRef, useState } from "react";
import { FileAudio, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { TIMESLICE_MS } from "@/hooks/use-recorder";
import { mmss } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The primary actions: record, or drop/choose a file. Turns into a status bar while recording. */
export function CaptureActions({ session }: { session: LectureSession }) {
  const { recorder, busy } = session;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canUpload = !recorder.recording && !busy;

  const upload = async (file: File | undefined) => {
    if (!file || !canUpload) return;
    await session.uploadFile(file);
    if (fileInput.current) fileInput.current.value = "";
  };

  if (recorder.recording) {
    return (
      <div
        className="flex flex-wrap items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3"
        role="status"
        aria-live="polite"
      >
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-red-500" />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-lg leading-none tabular-nums">
            {mmss(recorder.elapsed)}
          </span>
          <span className="text-xs text-muted-foreground">
            {recorder.sourceLabel ?? "Recording"} · saved every {TIMESLICE_MS / 1000} s · parts of{" "}
            {recorder.chunkSeconds} s
          </span>
        </div>
        <Button
          size="lg"
          variant="destructive"
          className="ml-auto h-11 px-5"
          onClick={session.stopRecording}
        >
          <Square className="fill-current" /> Stop &amp; make notes
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <Button
        size="lg"
        className="h-14 gap-2 px-7 text-base"
        onClick={session.startRecording}
        disabled={busy}
      >
        <Mic className="size-5" /> Record
      </Button>

      <button
        type="button"
        disabled={!canUpload}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex h-14 items-center gap-3 rounded-xl border border-dashed px-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <FileAudio className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Upload audio</span>
          <span className="text-xs text-muted-foreground">
            Drop a file here or browse · mp3, wav, m4a, ogg, webm, flac
          </span>
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        aria-label="Upload audio file"
        accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.flac"
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </div>
  );
}
