"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SECONDS } from "@/lib/stt/audio";

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find(
    (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );
}

export function useRecorder(onChunk: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const doneRef = useRef<(() => void) | null>(null);
  const cycleRef = useRef<() => void>(() => {});

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setRecording(false);
  }, []);

  const cycle = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    rec.onstop = () => {
      if (parts.length) onChunkRef.current(new Blob(parts, { type: rec.mimeType }));
      if (stoppingRef.current) {
        cleanup();
        doneRef.current?.();
        doneRef.current = null;
      } else {
        cycleRef.current();
      }
    };
    recRef.current = rec;
    rec.start();
    // Every window is a standalone, decodable file so it can be transcribed independently.
    timerRef.current = setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, CHUNK_SECONDS * 1000);
  }, [cleanup]);

  useEffect(() => {
    cycleRef.current = cycle;
  }, [cycle]);

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
    stoppingRef.current = false;
    setElapsed(0);
    setRecording(true);
    const t0 = Date.now();
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    cycle();
    return true;
  }, [cycle]);

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
