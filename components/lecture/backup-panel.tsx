"use client";

import { useRef } from "react";
import { Archive, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LectureSession } from "@/hooks/use-lecture-session";
import type { ImportMode } from "@/lib/backup/backup";
import { BACKUP_EXTENSION } from "@/lib/backup/backup";

export function BackupPanel({ session }: { session: LectureSession }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, recorder } = session;
  const disabled = busy || recorder.recording;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const merge = window.confirm(
      "Merge with existing lectures?\n\nOK = merge (same ids are overwritten)\nCancel = replace everything on this device",
    );
    const mode: ImportMode = merge ? "merge" : "replace";
    if (!merge) {
      const sure = window.confirm(
        "Replace will delete all lectures and audio on this device before importing. Continue?",
      );
      if (!sure) return;
    }
    void session.importBackup(file, mode);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section
      className="flex flex-col gap-2 border-t border-white/10 pt-4"
      aria-labelledby="backup-heading"
    >
      <h2
        id="backup-heading"
        className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        <Archive className="size-3.5" aria-hidden /> Backup
      </h2>
      <p className="text-xs text-muted-foreground">
        Export lectures and audio as one {BACKUP_EXTENSION} file, or restore on another browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void session.exportBackup()}>
          <Archive /> Export backup
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload /> Import backup
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Import backup file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
    </section>
  );
}
