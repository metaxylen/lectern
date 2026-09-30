import { SimpleSelect } from "@/components/simple-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { WHISPER_MODELS } from "@/hooks/use-whisper";
import { NOTES_OPTIONS, SPEECH_OPTIONS } from "@/lib/languages";
import type { NotesEngineChoice } from "@/lib/types";

const ENGINE_OPTIONS = [
  { value: "auto", label: "Auto (Ollama → Gemini → Offline)" },
  { value: "ollama", label: "Ollama (local model)" },
  { value: "gemini", label: "Gemini (free tier)" },
  { value: "offline", label: "Offline summarizer" },
];

const MODEL_OPTIONS = WHISPER_MODELS.map((m) => ({ value: m.id, label: m.label }));

export function SessionSetup({ session }: { session: LectureSession }) {
  const { recorder, busy } = session;
  const locked = recorder.recording;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session setup</CardTitle>
        <CardDescription>
          Built for English lectures with Turkish asides: each ~{recorder.chunkSeconds}s chunk is
          language-detected on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SimpleSelect
          id="audio-lang"
          label="Lecture language (speech)"
          value={session.audioLang}
          onChange={session.setAudioLang}
          options={SPEECH_OPTIONS}
          disabled={locked || busy}
        />
        <SimpleSelect
          id="notes-lang"
          label="Notes language"
          value={session.notesLang}
          onChange={session.setNotesLang}
          options={NOTES_OPTIONS}
          disabled={locked}
        />
        <SimpleSelect
          id="whisper-model"
          label="Whisper model (local)"
          value={session.modelId}
          onChange={session.setModelChoice}
          options={MODEL_OPTIONS}
          disabled={locked || busy}
        />
        <SimpleSelect
          id="notes-engine"
          label="Notes engine"
          value={session.engineChoice}
          onChange={(v) => session.setEngineChoice(v as NotesEngineChoice)}
          options={ENGINE_OPTIONS}
          disabled={locked}
        />
        <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-4">
          <Label htmlFor="notes-context">Course or topic hints (optional)</Label>
          <Textarea
            id="notes-context"
            rows={2}
            maxLength={800}
            value={session.context}
            onChange={(e) => session.setContext(e.target.value)}
            disabled={locked}
            placeholder="e.g. Operating Systems, week 6: synchronization. Terms: mutex, semaphore, Dijkstra."
          />
          <p className="text-xs text-muted-foreground">
            Names and terms listed here are used to correct misheard words and to keep notes
            consistent.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
