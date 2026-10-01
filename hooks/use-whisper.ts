"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWavPcm16 } from "@/lib/stt/wav";
import { isNativeWhisper } from "@/lib/stt/models";

export type WhisperStatus = "idle" | "loading" | "ready" | "error";
export type WhisperDevice = "webgpu" | "wasm" | "metal" | "cpu";

export {
  MODEL_NATIVE,
  MODEL_WITHOUT_WEBGPU,
  MODEL_WITH_WEBGPU,
  WHISPER_MODELS,
} from "@/lib/stt/models";

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export type WhisperResult = { text: string; language?: string };

type Pending = { resolve: (r: WhisperResult) => void; reject: (e: Error) => void };

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `Transcription failed (${res.status})`;
}

export function useWhisper(modelId: string) {
  const [status, setStatus] = useState<WhisperStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState<WhisperDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const loadedModel = useRef<string | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const files = useRef(new Map<string, { loaded: number; total: number }>());
  const nextId = useRef(1);
  const nativeReady = useRef(false);
  const nativeWarmup = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dispose = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    nativeWarmup.current = null;
    nativeReady.current = false;
    workerRef.current?.terminate();
    workerRef.current = null;
    loadedModel.current = null;
    pending.current.forEach((p) => p.reject(new Error("Whisper worker stopped")));
    pending.current.clear();
  }, []);

  useEffect(() => dispose, [dispose]);

  const loadNative = useCallback((): Promise<void> => {
    if (loadedModel.current === modelId && nativeReady.current) {
      return nativeWarmup.current ?? Promise.resolve();
    }
    if (loadedModel.current === modelId && nativeWarmup.current) return nativeWarmup.current;
    dispose();
    setStatus("loading");
    setProgress(15);
    setError(null);
    setNotice(null);
    loadedModel.current = modelId;
    const abort = new AbortController();
    abortRef.current = abort;
    const run = (async () => {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "X-Warmup": "1" },
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { backend?: WhisperDevice };
      if (abort.signal.aborted) return;
      nativeReady.current = true;
      setDevice(body.backend === "cpu" ? "cpu" : "metal");
      setProgress(100);
      setNotice(null);
      setStatus("ready");
    })().catch((err: unknown) => {
      if (abort.signal.aborted) return;
      nativeReady.current = false;
      loadedModel.current = null;
      nativeWarmup.current = null;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      throw err;
    });
    nativeWarmup.current = run;
    return run;
  }, [modelId, dispose]);

  const loadWorker = useCallback(() => {
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

  const load = useCallback(() => {
    if (isNativeWhisper(modelId)) void loadNative().catch(() => {});
    else loadWorker();
  }, [modelId, loadNative, loadWorker]);

  const transcribeNative = useCallback(
    async (audio: Float32Array, language?: string) => {
      await loadNative();
      const wav = encodeWavPcm16(audio);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "audio/wav",
          "X-Speech-Language": language && language !== "auto" ? language : "auto",
        },
        body: new Blob([wav as BlobPart], { type: "audio/wav" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as WhisperResult;
    },
    [loadNative],
  );

  const transcribe = useCallback(
    (audio: Float32Array, language?: string) => {
      if (isNativeWhisper(modelId)) return transcribeNative(audio, language);
      loadWorker();
      const worker = workerRef.current;
      if (!worker) return Promise.reject(new Error("Whisper worker unavailable"));
      const id = nextId.current++;
      return new Promise<WhisperResult>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        worker.postMessage({ type: "transcribe", id, audio, language }, [audio.buffer]);
      });
    },
    [modelId, loadWorker, transcribeNative],
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
    setNotice(null);
  }, [dispose]);

  return { status, progress, device, error, notice, load, retry, cancel, transcribe };
}
