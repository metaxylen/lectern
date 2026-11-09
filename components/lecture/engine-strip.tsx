import type { useWhisper } from "@/hooks/use-whisper";
import type { EngineStatus } from "@/lib/types";

type Chip = { label: string; state: "ok" | "warn" | "idle" };

const DOT: Record<Chip["state"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  idle: "bg-muted-foreground/40",
};

function whisperText(whisper: ReturnType<typeof useWhisper>) {
  const device =
    whisper.device === "webgpu"
      ? "WebGPU"
      : whisper.device === "wasm"
        ? "WASM"
        : whisper.device === "metal"
          ? "Metal"
          : whisper.device === "cpu"
            ? "CPU"
            : "";
  switch (whisper.status) {
    case "ready":
      return device ? `ready · ${device}` : "ready";
    case "loading":
      return whisper.device === "metal" || whisper.progress < 20
        ? "starting…"
        : `downloading ${whisper.progress}%`;
    case "error":
      return "failed to load";
    default:
      return "loads on first use";
  }
}

function ollamaChip(engines: EngineStatus | null): Chip {
  if (!engines) return { label: "Ollama: checking…", state: "idle" };
  if (!engines.ollama.reachable) return { label: "Ollama: not running", state: "idle" };
  return {
    label: `Ollama: ${engines.ollama.selected ?? "no model pulled"}`,
    state: engines.ollama.selected ? "ok" : "warn",
  };
}

function openaiChip(engines: EngineStatus | null): Chip {
  if (!engines) return { label: "OpenAI-compatible: checking…", state: "idle" };
  return {
    label: engines.openai.configured
      ? `OpenAI-compatible: ${engines.openai.model}`
      : "OpenAI-compatible: not configured",
    state: engines.openai.configured ? "ok" : "idle",
  };
}

export function EngineStrip({
  whisper,
  modelId,
  engines,
  previewSupported,
}: {
  whisper: ReturnType<typeof useWhisper>;
  modelId: string;
  engines: EngineStatus | null;
  previewSupported: boolean;
}) {
  const model = modelId.split("/").pop();
  const gemini = engines?.gemini;
  const chips: Chip[] = [
    {
      label: `Whisper ${model}: ${whisperText(whisper)}`,
      state: whisper.status === "ready" ? "ok" : whisper.status === "error" ? "warn" : "idle",
    },
    {
      label: previewSupported
        ? "Live preview: Web Speech"
        : "Live preview: unsupported in this browser",
      state: previewSupported ? "ok" : "idle",
    },
    ollamaChip(engines),
    openaiChip(engines),
    {
      label: gemini?.disabled
        ? "Gemini: disabled"
        : gemini?.configured
          ? "Gemini: key set"
          : "Gemini: no key",
      state: gemini?.disabled || !gemini?.configured ? "idle" : "ok",
    },
    { label: "Offline summarizer: always available", state: "ok" },
  ];

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Engine status">
      {chips.map((c) => (
        <li
          key={c.label}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs"
        >
          <span className={`size-1.5 rounded-full ${DOT[c.state]}`} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
