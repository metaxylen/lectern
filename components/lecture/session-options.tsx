"use client";

import { useId, useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { SimpleSelect } from "@/components/simple-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { WHISPER_MODELS } from "@/hooks/use-whisper";
import { NOTES_OPTIONS, SPEECH_OPTIONS } from "@/lib/languages";
import { shortModelName } from "@/lib/stt/models";
import type { EngineStatus, NotesEngineChoice } from "@/lib/types";
import { cn } from "@/lib/utils";

const ENGINE_OPTIONS = [
  { value: "auto", label: "Automatic (best available)" },
  { value: "ollama", label: "Ollama (local model)" },
  { value: "gemini", label: "Gemini (free tier)" },
  { value: "offline", label: "Offline summarizer" },
];

const MODEL_OPTIONS = WHISPER_MODELS.map((m) => ({ value: m.id, label: m.label }));

const SPEECH_SHORT: Record<string, string> = { auto: "Auto EN + TR", en: "English", tr: "Türkçe" };
const NOTES_SHORT: Record<string, string> = {
  "en-glossary": "Notes: EN + TR glossary",
  en: "Notes: English",
  tr: "Notes: Türkçe",
};

function speechLabel(value: string) {
  return SPEECH_SHORT[value] ?? SPEECH_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function notesLabel(value: string) {
  return (
    NOTES_SHORT[value] ?? `Notes: ${NOTES_OPTIONS.find((o) => o.value === value)?.label ?? value}`
  );
}

/** What "automatic" will actually use right now, so the user is never guessing. */
function engineSummary(choice: NotesEngineChoice, engines: EngineStatus | null): string {
  if (choice === "offline") return "Offline summarizer";
  if (choice === "gemini") return "Gemini";
  const ollama = engines?.ollama;
  if (choice === "ollama" || choice === "auto") {
    if (ollama?.reachable && ollama.selected) return `Ollama · ${ollama.selected}`;
    if (choice === "ollama") return "Ollama (not running)";
    if (engines?.gemini.configured) return "Gemini";
    return engines ? "Offline summarizer" : "Checking engines…";
  }
  return "";
}

function engineHint(choice: NotesEngineChoice, engines: EngineStatus | null): string {
  if (!engines) return "Checking which engines are available…";
  if (choice === "auto") {
    return engines.ollama.reachable
      ? `Will use Ollama with ${engines.ollama.selected ?? "no model installed"}.`
      : "Ollama is not running; Gemini or the offline summarizer will be used.";
  }
  if (choice === "ollama" && !engines.ollama.reachable) return "Ollama is not running right now.";
  if (choice === "gemini" && !engines.gemini.configured) return "No GEMINI_API_KEY is configured.";
  return "";
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** Collapsible settings: a one-line summary of the choices, expandable to change them. */
export function SessionOptions({ session }: { session: LectureSession }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { recorder, busy, engines } = session;
  const locked = recorder.recording;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Settings2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Session options</span>
        <span className="flex flex-wrap items-center gap-1.5" aria-label="Current options">
          <Chip>{speechLabel(session.audioLang)}</Chip>
          <Chip>{notesLabel(session.notesLang)}</Chip>
          <Chip>Whisper {shortModelName(session.modelId).replace("whisper-", "")}</Chip>
          <Chip>{engineSummary(session.engineChoice, engines)}</Chip>
          {session.liveEnabled && <Chip>Live</Chip>}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div id={panelId} className="grid gap-4 border-t p-3 sm:grid-cols-2">
          <SimpleSelect
            id="audio-lang"
            label="Lecture language (speech)"
            value={session.audioLang}
            onChange={session.setAudioLang}
            options={SPEECH_OPTIONS}
            disabled={locked || busy}
            hint={`Auto-detect chooses English or Turkish for every ~${recorder.chunkSeconds} s part, so Turkish asides stay Turkish.`}
          />
          <SimpleSelect
            id="notes-lang"
            label="Notes language"
            value={session.notesLang}
            onChange={session.setNotesLang}
            options={NOTES_OPTIONS}
            disabled={locked}
            hint="The language the study notes are written in."
          />
          <SimpleSelect
            id="whisper-model"
            label="Whisper model (local)"
            value={session.modelId}
            onChange={session.setModelChoice}
            options={MODEL_OPTIONS}
            disabled={locked || busy}
            hint="Larger models are more accurate and slower. Downloaded once, then cached."
          />
          <SimpleSelect
            id="notes-engine"
            label="Notes engine"
            value={session.engineChoice}
            onChange={(v) => session.setEngineChoice(v as NotesEngineChoice)}
            options={ENGINE_OPTIONS}
            disabled={locked}
            hint={engineHint(session.engineChoice, engines)}
          />

          <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/50 p-3 sm:col-span-2">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="live-transcript">Live transcript</Label>
              <p className="text-xs text-muted-foreground">
                Shows a draft every few seconds while recording. Uses more processor power; turn it
                off on a slow or hot machine. The final transcript is unaffected.
              </p>
            </div>
            <Switch
              id="live-transcript"
              aria-label="Live transcript"
              checked={session.liveEnabled}
              onCheckedChange={session.setLiveEnabled}
              disabled={recorder.recording}
            />
          </div>
        </div>
      )}
    </div>
  );
}
