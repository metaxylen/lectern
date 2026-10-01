"use client";

import { useSyncExternalStore } from "react";
import { Info, Mic, MonitorSpeaker } from "lucide-react";
import { SimpleSelect } from "@/components/simple-select";
import type { LectureSession, SourceChoice } from "@/hooks/use-lecture-session";
import { isTabCaptureSupported, looksLikeLoopback } from "@/lib/audio/capture";
import { cn } from "@/lib/utils";

const TILES: {
  value: SourceChoice;
  title: string;
  description: string;
  icons: React.ReactNode;
  needsTabCapture: boolean;
}[] = [
  {
    value: "mic",
    title: "Microphone",
    description: "A lecture hall, a meeting, or a loopback input",
    icons: <Mic className="size-4" />,
    needsTabCapture: false,
  },
  {
    value: "tab",
    title: "Tab or screen audio",
    description: "Whatever a browser tab is playing",
    icons: <MonitorSpeaker className="size-4" />,
    needsTabCapture: true,
  },
  {
    value: "tab-mic",
    title: "Tab audio + microphone",
    description: "Online lecture where you also speak",
    icons: (
      <>
        <MonitorSpeaker className="size-4" />
        <Mic className="size-4" />
      </>
    ),
    needsTabCapture: true,
  },
];

const DEFAULT_DEVICE = "default";

/** Choose where the sound comes from: three tiles, plus the input device when it matters. */
export function SourceTiles({ session }: { session: LectureSession }) {
  const { recorder, busy, inputs, sourceChoice } = session;
  const tabSupported = useSyncExternalStore(
    () => () => {},
    isTabCaptureSupported,
    () => false,
  );
  const locked = recorder.recording || busy;
  const usesDevice = sourceChoice === "mic" || sourceChoice === "tab-mic";
  const hasLoopback = inputs.some((d) => looksLikeLoopback(d.label));

  const deviceOptions = [
    { value: DEFAULT_DEVICE, label: "System default input" },
    ...inputs.map((d) => ({
      value: d.deviceId,
      label: looksLikeLoopback(d.label) ? `${d.label} (system audio)` : d.label,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Audio source" className="grid gap-2 sm:grid-cols-3">
        {TILES.map((tile) => {
          const unavailable = tile.needsTabCapture && !tabSupported;
          const disabled = locked || unavailable;
          const selected = sourceChoice === tile.value;
          return (
            <label
              key={tile.value}
              className={cn(
                "relative flex min-h-24 cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition-colors duration-200",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                selected
                  ? "border-primary/70 bg-primary/12 ring-1 ring-primary/50"
                  : "border-white/10 bg-white/4 hover:border-primary/40 hover:bg-white/8",
                disabled && "cursor-not-allowed opacity-55 hover:border-white/10 hover:bg-white/4",
              )}
            >
              <input
                type="radio"
                name="audio-source"
                value={tile.value}
                checked={selected}
                disabled={disabled}
                onChange={() => session.setSourceChoice(tile.value)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  selected ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden
              >
                {tile.icons}
              </span>
              <span className="text-sm leading-tight font-medium">{tile.title}</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {unavailable ? "Needs Chrome or Edge" : tile.description}
              </span>
            </label>
          );
        })}
      </div>

      {usesDevice && (
        <div className="max-w-sm">
          <SimpleSelect
            id="audio-input"
            label={sourceChoice === "mic" ? "Input device" : "Microphone"}
            value={session.micDeviceId || DEFAULT_DEVICE}
            onChange={(v) => session.setMicDeviceId(v === DEFAULT_DEVICE ? "" : v)}
            options={deviceOptions}
            disabled={locked}
          />
        </div>
      )}

      {sourceChoice !== "mic" && (
        <p className="flex gap-2 rounded-lg border border-white/8 bg-white/4 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            A window asks what to share: choose a browser tab and tick{" "}
            <strong className="text-foreground">Also share tab audio</strong>. Works in Chrome and
            Edge. To capture everything your computer plays on a Mac, install a virtual audio input
            such as BlackHole, route your output through it, and pick it as the input device with{" "}
            <em>Microphone</em> above.
          </span>
        </p>
      )}
      {sourceChoice === "mic" && hasLoopback && (
        <p className="flex gap-2 rounded-lg border border-white/8 bg-white/4 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            A virtual input is available. Choose it as the input device to transcribe everything
            your computer plays.
          </span>
        </p>
      )}
    </div>
  );
}
