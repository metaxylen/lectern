import { env, pipeline } from "@huggingface/transformers";
import { detectLanguage } from "./detect-language";

type LoadMsg = { type: "load"; model: string; device: "webgpu" | "wasm" };
type TranscribeMsg = { type: "transcribe"; id: number; audio: Float32Array; language?: string };
type InMsg = LoadMsg | TranscribeMsg;

env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asr = ((audio: Float32Array, opts: Record<string, unknown>) => Promise<any>) &
  Record<string, unknown>;

let asr: Asr | null = null;
let loading: Promise<void> | null = null;

function post(msg: unknown) {
  self.postMessage(msg);
}

async function build(model: string, device: "webgpu" | "wasm"): Promise<Asr> {
  const progress_callback = (p: unknown) => post({ type: "progress", data: p });
  const options =
    device === "webgpu"
      ? {
          device: "webgpu",
          dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
          progress_callback,
        }
      : { device: "wasm", dtype: "q8", progress_callback };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await pipeline("automatic-speech-recognition", model, options as any)) as unknown as Asr;
}

/** `navigator.gpu` can exist without a usable GPU (headless, blocklisted drivers, VMs). */
async function webGpuUsable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return !!(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

async function load(model: string, requested: "webgpu" | "wasm") {
  let preferred = requested;
  if (requested === "webgpu" && !(await webGpuUsable())) {
    preferred = "wasm";
    post({ type: "notice", message: "No usable GPU found, running on the CPU (WASM)." });
  }
  try {
    asr = await build(model, preferred);
    post({ type: "ready", device: preferred });
  } catch (err) {
    if (preferred === "webgpu") {
      post({ type: "notice", message: "WebGPU failed, falling back to WASM (CPU)." });
      asr = await build(model, "wasm");
      post({ type: "ready", device: "wasm" });
    } else {
      throw err;
    }
  }
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      loading = load(msg.model, msg.device);
      await loading;
      return;
    }
    if (msg.type === "transcribe") {
      if (loading) await loading;
      if (!asr) throw new Error("Whisper model is not loaded");
      let language = msg.language;
      if (!language || language === "auto") {
        language = (await detectLanguage(asr, msg.audio)).language;
      }
      const out = await asr(msg.audio, {
        language,
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
      post({ type: "result", id: msg.id, text: String(text ?? "").trim(), language });
    }
  } catch (err) {
    post({
      type: "error",
      id: msg.type === "transcribe" ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
