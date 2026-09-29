"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WhisperStatus = "idle" | "loading" | "ready" | "error";

export { MODEL_WITHOUT_WEBGPU, MODEL_WITH_WEBGPU, WHISPER_MODELS } from "@/lib/stt/models";

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export type WhisperResult = { text: string; language?: string };

type Pending = { resolve: (r: WhisperResult) => void; reject: (e: Error) => void };

export function useWhisper(modelId: string) {
  const [status, setStatus] = useState<WhisperStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState<"webgpu" | "wasm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const loadedModel = useRef<string | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const files = useRef(new Map<string, { loaded: number; total: number }>());
  const nextId = useRef(1);

  const dispose = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    loadedModel.current = null;
    pending.current.forEach((p) => p.reject(new Error("Whisper worker stopped")));
    pending.current.clear();
  }, []);

  useEffect(() => dispose, [dispose]);

  const load = useCallback(() => {
    if (workerRef.current && loadedModel.current === modelId) return;
    dispose();
    setStatus("loading");
    setProgress(0);
    setError(null);
    setNotice(null);
    files.current.clear();

    const worker = new Worker(new URL("../lib/stt/whisper.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    loadedModel.current = modelId;

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") {
        const d = m.data as { status?: string; file?: string; loaded?: number; total?: number };
        if (d.status === "progress" && d.file && d.total) {
          files.current.set(d.file, { loaded: d.loaded ?? 0, total: d.total });
          let loaded = 0;
          let total = 0;
          files.current.forEach((f) => {
            loaded += f.loaded;
            total += f.total;
          });
          setProgress(total ? Math.min(99, Math.round((loaded / total) * 100)) : 0);
        }
      } else if (m.type === "ready") {
        setDevice(m.device);
        setProgress(100);
        setStatus("ready");
      } else if (m.type === "notice") {
        setNotice(m.message);
      } else if (m.type === "result") {
        pending.current.get(m.id)?.resolve({ text: m.text, language: m.language });
        pending.current.delete(m.id);
      } else if (m.type === "error") {
        if (m.id !== undefined) {
          pending.current.get(m.id)?.reject(new Error(m.message));
          pending.current.delete(m.id);
        } else {
          setError(m.message);
          setStatus("error");
          loadedModel.current = null;
        }
      }
    };
    worker.onerror = (e) => {
      setError(e.message || "Whisper worker crashed");
      setStatus("error");
      loadedModel.current = null;
    };

    worker.postMessage({ type: "load", model: modelId, device: hasWebGpu() ? "webgpu" : "wasm" });
  }, [modelId, dispose]);

  const transcribe = useCallback(
    (audio: Float32Array, language?: string) => {
      load();
      const worker = workerRef.current;
      if (!worker) return Promise.reject(new Error("Whisper worker unavailable"));
      const id = nextId.current++;
      return new Promise<WhisperResult>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        worker.postMessage({ type: "transcribe", id, audio, language }, [audio.buffer]);
      });
    },
    [load],
  );

  /** Throw away a failed or stuck load and start over. */
  const retry = useCallback(() => {
    dispose();
    load();
  }, [dispose, load]);

  /** Abort a download in progress and go back to idle. Cached files are kept. */
  const cancel = useCallback(() => {
    dispose();
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, [dispose]);

  return { status, progress, device, error, notice, load, retry, cancel, transcribe };
}
