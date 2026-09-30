"use client";

import { useSyncExternalStore } from "react";
import { SimpleSelect } from "@/components/simple-select";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { isTabCaptureSupported, looksLikeLoopback } from "@/lib/audio/capture";

const SOURCE_OPTIONS = [
  { value: "mic", label: "Microphone" },
  { value: "tab", label: "Browser tab or screen audio (what you hear)" },
  { value: "tab-mic", label: "Tab audio + my microphone" },
];

const DEFAULT_DEVICE = "default";

/** Where the sound comes from, which input device to use, and whether to show live text. */
export function AudioSourcePicker({ session }: { session: LectureSession }) {
  const { recorder, busy, inputs, sourceChoice } = session;
  const tabSupported = useSyncExternalStore(
    () => () => {},
    isTabCaptureSupported,
    () => false,
  );
  const locked = recorder.recording || busy;
  const usesDevice = sourceChoice === "mic" || sourceChoice === "tab-mic";
  const options = tabSupported ? SOURCE_OPTIONS : SOURCE_OPTIONS.slice(0, 1);

  const deviceOptions = [
    { value: DEFAULT_DEVICE, label: "System default input" },
    ...inputs.map((d) => ({
      value: d.deviceId,
      label: looksLikeLoopback(d.label) ? `${d.label} (system audio)` : d.label,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SimpleSelect
          id="audio-source"
          label="Audio source"
          value={sourceChoice}
          onChange={(v) => session.setSourceChoice(v as typeof sourceChoice)}
          options={options}
          disabled={locked}
        />
        {usesDevice && (
          <SimpleSelect
            id="audio-input"
            label={sourceChoice === "mic" ? "Input device" : "Microphone"}
            value={session.micDeviceId || DEFAULT_DEVICE}
            onChange={(v) => session.setMicDeviceId(v === DEFAULT_DEVICE ? "" : v)}
            options={deviceOptions}
            disabled={locked}
          />
        )}
      </div>

      {sourceChoice !== "mic" && (
        <p className="text-xs text-muted-foreground">
          A window asks what to share: choose a browser tab and tick{" "}
          <strong>Also share tab audio</strong>. Works in Chrome and Edge. To capture everything
          your computer plays on a Mac, install a virtual audio input such as BlackHole, route your
          output through it, and pick it as the input device with <em>Microphone</em> above.
        </p>
      )}
      {sourceChoice === "mic" && inputs.some((d) => looksLikeLoopback(d.label)) && (
        <p className="text-xs text-muted-foreground">
          A virtual input is available. Choose it as the input device to transcribe everything your
          computer plays.
        </p>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={session.liveEnabled}
          onChange={(e) => session.setLiveEnabled(e.target.checked)}
          disabled={recorder.recording}
        />
        <span>
          Live transcript
          <span className="block text-xs text-muted-foreground">
            Shows words every few seconds while recording. Uses more processor power; turn it off on
            a slow or hot machine. The final transcript is unaffected.
          </span>
        </span>
      </label>
    </div>
  );
}
