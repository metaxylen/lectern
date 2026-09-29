"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SECONDS } from "@/lib/stt/audio";

export type RecordedChunk = {
  index: number;
  blob: Blob;
  mimeType: string;
  /** Wall-clock length of this chunk. */
  durationSec: number;
};

export type RecorderHandlers = {
  /** A chunk is finished: a standalone, decodable file. */
  onChunk: (chunk: RecordedChunk) => void;
  /** The current chunk grew. Called every couple of seconds so it can be persisted mid-chunk. */
  onPartial?: (chunk: RecordedChunk) => void;
  /** Recording ended without the user pressing stop (microphone lost). */
  onEnded?: () => void;
};

/** How often MediaRecorder flushes data, which bounds how much a crash can lose. */
export const TIMESLICE_MS = 2000;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find(
    (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );
}

type WakeLockSentinelLike = { release: () => Promise<void> };

export function useRecorder(handlers: RecorderHandlers) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const doneRef = useRef<(() => void) | null>(null);
  const cycleRef = useRef<() => void>(() => {});
  const indexRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      wakeLockRef.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      // Not supported or denied (e.g. low battery): recording still works.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    releaseWakeLock();
    setRecording(false);
  }, [releaseWakeLock]);

  const cycle = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    const index = indexRef.current++;
    const startedAt = performance.now();
    const describe = (): RecordedChunk => ({
      index,
      blob: new Blob(parts, { type: rec.mimeType }),
      mimeType: rec.mimeType,
      durationSec: (performance.now() - startedAt) / 1000,
    });

    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      parts.push(e.data);
      // The concatenation of timeslices from one recorder is a valid (growing) file.
      if (rec.state === "recording") handlersRef.current.onPartial?.(describe());
    };
    rec.onstop = () => {
      if (parts.length) handlersRef.current.onChunk(describe());
      if (stoppingRef.current) {
        const done = doneRef.current;
        doneRef.current = null;
        cleanup();
        // No pending stop() means the recorder ended by itself (e.g. the microphone was unplugged).
        if (done) done();
        else handlersRef.current.onEnded?.();
      } else {
        cycleRef.current();
      }
    };
    recRef.current = rec;
    rec.start(TIMESLICE_MS);
    // Every window is a standalone, decodable file so it can be transcribed independently.
    timerRef.current = setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, CHUNK_SECONDS * 1000);
  }, [cleanup]);

  useEffect(() => {
    cycleRef.current = cycle;
  }, [cycle]);

  // The OS drops the wake lock when the tab is hidden; take it back when the user returns.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && streamRef.current) void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [acquireWakeLock]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording.");
      return false;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(
        denied
          ? "Microphone permission was denied. Allow it in the browser and try again."
          : "Could not open the microphone. Is one connected? (Needs HTTPS or localhost.)",
      );
      return false;
    }
    // If the microphone disappears mid-lecture (unplugged, revoked), finish cleanly instead of
    // silently recording nothing.
    streamRef.current.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (recRef.current?.state === "recording") {
          setError("The microphone stopped. Your recording so far has been kept.");
          stoppingRef.current = true;
          if (timerRef.current) clearTimeout(timerRef.current);
          recRef.current.stop();
        }
      };
    });
    stoppingRef.current = false;
    indexRef.current = 0;
    setElapsed(0);
    setRecording(true);
    void acquireWakeLock();
    const t0 = Date.now();
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    cycle();
    return true;
  }, [acquireWakeLock, cycle]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return Promise.resolve();
    stoppingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    return new Promise<void>((resolve) => {
      doneRef.current = resolve;
      if (rec.state === "recording") rec.stop();
      else {
        cleanup();
        resolve();
      }
    });
  }, [cleanup]);

  useEffect(
    () => () => {
      stoppingRef.current = true;
      if (recRef.current?.state === "recording") recRef.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return { recording, elapsed, error, start, stop, chunkSeconds: CHUNK_SECONDS };
}
