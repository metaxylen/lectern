export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-tiny", label: "Tiny (~40 MB, fastest, weakest)" },
  { id: "onnx-community/whisper-base", label: "Base (~80 MB, default without WebGPU)" },
  {
    id: "onnx-community/whisper-small",
    label: "Small (~250 MB, default with WebGPU, best accuracy)",
  },
] as const;

export const WHISPER_MODEL_IDS: string[] = WHISPER_MODELS.map((m) => m.id);

export const MODEL_WITH_WEBGPU = "onnx-community/whisper-small";
export const MODEL_WITHOUT_WEBGPU = "onnx-community/whisper-base";

export function shortModelName(id: string): string {
  return id.split("/").pop() ?? id;
}
