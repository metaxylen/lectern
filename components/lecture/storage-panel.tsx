"use client";

import { useEffect, useState } from "react";
import { HardDrive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/components/lecture/audio-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { estimateStorage, type StorageEstimate } from "@/lib/audio-store";
import { deleteCachedModel, listCachedModels, type CachedModel } from "@/lib/stt/model-cache";
import { shortModelName } from "@/lib/stt/models";

/** What this app keeps on the device: downloaded Whisper models and how much room is left. */
export function StoragePanel({ session }: { session: LectureSession }) {
  const [models, setModels] = useState<CachedModel[]>([]);
  const [estimate, setEstimate] = useState<StorageEstimate>(null);
  const { whisper, busy, recorder } = session;

  const [reloadKey, setReloadKey] = useState(0);

  // Re-read after a download finishes or a lecture is saved or deleted.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listCachedModels(), estimateStorage()]).then(([m, e]) => {
      if (cancelled) return;
      setModels(m);
      setEstimate(e);
    });
    return () => {
      cancelled = true;
    };
  }, [whisper.status, session.lectures.length, busy, reloadKey]);

  const remove = async (id: string) => {
    try {
      await deleteCachedModel(id);
      toast(`${shortModelName(id)} model removed. It will download again when needed.`);
    } catch {
      toast.error("Could not remove the model.");
    }
    setReloadKey((k) => k + 1);
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4" /> On this device
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">No Whisper models downloaded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Downloaded models">
            {models.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="font-medium">
                  Whisper {shortModelName(m.id).replace("whisper-", "")}
                </span>
                <span className="text-xs text-muted-foreground">{formatBytes(m.bytes)}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`Remove ${shortModelName(m.id)} model`}
                  disabled={busy || recorder.recording || whisper.status === "loading"}
                  onClick={() => remove(m.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {estimate && (
          <p className="text-xs text-muted-foreground">
            Browser storage: {formatBytes(estimate.usage)} used of about{" "}
            {formatBytes(estimate.quota)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
