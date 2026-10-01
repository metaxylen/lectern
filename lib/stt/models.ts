export const NATIVE_WHISPER_ID = "whisper.cpp/large-v3-turbo";

export function isNativeWhisper(id: string): boolean {
  return id.startsWith("whisper.cpp/");
}

export const WHISPER_MODELS = [
  {
    id: NATIVE_WHISPER_ID,
    label: "Turbo · large-v3-turbo · most accurate (this Mac)",
  },
  { id: "onnx-community/whisper-tiny", label: "Tiny · ~40 MB · in browser · fastest" },
  { id: "onnx-community/whisper-base", label: "Base · ~80 MB · in browser" },
  { id: "onnx-community/whisper-small", label: "Small · ~250 MB · in browser" },
] as const;

/** Hugging Face repos cached in the browser. Native models live on disk instead. */
export const WHISPER_MODEL_IDS: string[] = WHISPER_MODELS.map((m) => m.id).filter(
  (id) => !isNativeWhisper(id),
);

export const MODEL_NATIVE = NATIVE_WHISPER_ID;
export const MODEL_WITH_WEBGPU = "onnx-community/whisper-small";
export const MODEL_WITHOUT_WEBGPU = "onnx-community/whisper-base";

export function shortModelName(id: string): string {
  return id.split("/").pop() ?? id;
}
