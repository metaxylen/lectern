import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { formatTimestamp } from "@/lib/segments";

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function AudioControls({ session }: { session: LectureSession }) {
  const { player, current } = session;
  if (!current?.hasAudio) return null;
  if (player.error) return <p className="text-xs text-destructive">{player.error}</p>;
  if (!player.ready) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <Button
        size="icon-sm"
        variant="secondary"
        aria-label={player.playing ? "Pause audio" : "Play audio"}
        onClick={player.toggle}
      >
        {player.playing ? <Pause /> : <Play />}
      </Button>
      <input
        type="range"
        aria-label="Audio position"
        className="h-1 flex-1 accent-primary"
        min={0}
        max={Math.max(1, Math.floor(player.duration))}
        value={Math.min(Math.floor(player.currentTime), Math.floor(player.duration))}
        onChange={(e) => player.seek(Number(e.target.value), player.playing)}
      />
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatTimestamp(player.currentTime)} / {formatTimestamp(player.duration)}
      </span>
    </div>
  );
}
